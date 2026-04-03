var express = require('express');
var router = express.Router();
let mongoose = require('mongoose');
let { checkLogin } = require('../utils/authHandler');
let { uploadFile } = require('../utils/upload');
let messageSchema = require('../schemas/messages');

let USER_MESSAGE_FIELDS = "username fullName avatarUrl";

// GET / - Lay message cuoi cung cua moi user ma user hien tai nhan tin
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let currentUser = req.user._id;

        let lastMessages = await messageSchema.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUser },
                        { to: currentUser }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $addFields: {
                    otherUser: {
                        $cond: {
                            if: { $eq: ["$from", currentUser] },
                            then: "$to",
                            else: "$from"
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$otherUser",
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {
                $replaceRoot: { newRoot: "$lastMessage" }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);

        lastMessages = await messageSchema.populate(lastMessages, [
            { path: "from", select: USER_MESSAGE_FIELDS },
            { path: "to", select: USER_MESSAGE_FIELDS },
            { path: "otherUser", select: USER_MESSAGE_FIELDS }
        ]);

        res.status(200).send(lastMessages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// GET /:userID - Lay toan bo message giua user hien tai va userID
router.get('/:userID', checkLogin, async function (req, res, next) {
    try {
        let currentUser = req.user._id;
        let otherUser = req.params.userID;

        if (!mongoose.Types.ObjectId.isValid(otherUser)) {
            return res.status(400).send({ message: "userID khong hop le" });
        }

        let messages = await messageSchema.find({
            $or: [
                { from: currentUser, to: otherUser },
                { from: otherUser, to: currentUser }
            ]
        })
            .populate("from", USER_MESSAGE_FIELDS)
            .populate("to", USER_MESSAGE_FIELDS)
            .sort({ createdAt: 1 });

        res.status(200).send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// POST / - Gui message (text hoac file)
router.post('/', checkLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUser = req.user._id;
        let { to, text } = req.body;

        if (!to) {
            return res.status(400).send({ message: "to la bat buoc" });
        }

        if (!mongoose.Types.ObjectId.isValid(to)) {
            return res.status(400).send({ message: "to khong hop le" });
        }

        let messageContent = {};

        if (req.file) {
            // Neu co file upload -> type la "file", text la duong dan file
            messageContent.type = "file";
            messageContent.text = req.file.path.replace(/\\/g, "/");
        } else {
            // Neu khong co file -> type la "text", text la noi dung
            if (!text || !text.trim()) {
                return res.status(400).send({ message: "text hoac file la bat buoc" });
            }
            messageContent.type = "text";
            messageContent.text = text.trim();
        }

        let newMessage = await messageSchema.create({
            from: currentUser,
            to: to,
            messageContent: messageContent
        });

        newMessage = await messageSchema.findById(newMessage._id)
            .populate("from", USER_MESSAGE_FIELDS)
            .populate("to", USER_MESSAGE_FIELDS);

        res.status(201).send(newMessage);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;
