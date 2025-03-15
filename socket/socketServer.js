const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const MongoUtil = require("../mongo/query");
const SqlUtil = require("../sql/query");
const { v4: uuidv4 } = require("uuid"); // Generate unique room IDs

const JWT_SECRET_KEY = process.env.JWT_SECRET;

let onlineUserIdsSet = new Set();

const rooms = {}; // Store rooms and users
let mongoUtil;
let sqlUtil = new SqlUtil(); // SQL Utility instance

async function initializeMongoConnection() {
  try {
    mongoUtil = new MongoUtil();
    await mongoUtil.connect();
    console.log("✅ MongoDB Connection Established in socket server.");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed in socket server:", error);
  }
}

function setupSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      allowedHeaders: ["token", "authorization"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.headers["authorization"];
    console.log("🔒 Socket authentication token:", token); // Log the token
    jwt.verify(token, JWT_SECRET_KEY, (err, decode) => {
      if (err) {
        console.error(err);
        return next(new Error("Authentication Error"));
      }
      socket.userId = decode.id; // Set userId from JWT token
      socket.userName = decode.name; // Set userName from JWT token
      console.log(`✅ User authenticated. User ID: ${socket.userId}`); // Log the userId
      next();
    });
  });

  io.on("connection", async (socket) => {
    const userIdStr = socket.userId.toString();
    onlineUserIdsSet.add(userIdStr);
    io.emit(`return_online_status_${userIdStr}`, { online_status: true });

    console.log(`✅ User ${userIdStr} connected.`); // Log user connection

    // Online status check
    socket.on("online_status_check", (data) => {
      const { target_user_id } = data;
      const targetUserIdStr = target_user_id?.toString();
      const isOnline = onlineUserIdsSet.has(targetUserIdStr);
      io.emit(`return_online_status_${targetUserIdStr}`, {
        online_status: isOnline,
      });
    });

    /* // 🟢 Join a room (MySQL + Socket)
    socket.on("join_room", async ({ room_id }) => {
      const userId = socket.userId;
      console.log(`User ${userId} attempting to join Room ${room_id}`);

      try {
        // Check if the room exists in MySQL
        const checkRoom = await sqlUtil.find(
          "message_rooms",
          `WHERE room_uuid = ?`,
          [room_id]
        );

        if (checkRoom.length > 0) {
          socket.join(room_id);
          console.log(`✅ User ${userId} joined Room ${room_id}`);
        } else {
          // Room not found -> Create a new room
          await sqlUtil.insert(
            "message_rooms",
            "(room_uuid, user1_id, user2_id, created_at)",
            [room_id, userId, recipientId, new Date()]
          );
          socket.join(room_id);
          console.log(`✅ Room ${room_id} created & joined by User ${userId}`);
        }

        // Emit success event
        io.to(room_id).emit("room_joined", { room_id, user_id: userId });
      } catch (error) {
        console.error("❌ Error joining room:", error);
        socket.emit("error", { message: "Error joining room!" });
      }
    });

    // 🟢 Fetch message history
    socket.on(
      "get_message_data",
      async ({ page = 1, per_page = 50, room_id }) => {
        try {
          const messages = await mongoUtil.findWithPagination(
            "messages",
            page,
            per_page,
            { room_id: room_id.toString() },
            { created_at: -1 }
          );
          io.to(room_id).emit("message_data", messages);
        } catch (error) {
          console.error("❌ Error fetching messages:", error);
        }
      }
    );
 */

    // Handle user joining a room
    socket.on("joinRoom", async (data) => {
      try {
        const { roomId, userid } = data;
        if (!roomId || !userid) {
          console.error("❌ Missing roomId or userid");
          return;
        }

        console.log(`User ${userid} attempting to join Room ${roomId}`);

        const room = await sqlUtil.findRoomByUUID(roomId);
        if (!room) {
          console.error("❌ Room not found");
          return;
        }

        const recipientId =
          room.user1_id === userid ? room.user2_id : room.user1_id;
        if (!recipientId) {
          console.error("❌ Error: recipientId is undefined");
          return;
        }

        socket.join(roomId);
        console.log(
          `✅ User ${userid} joined Room ${roomId} with ${recipientId}`
        );
      } catch (error) {
        console.error("❌ Error joining room:", error);
      }
    });

    // Handle sending messages
    socket.on("sendMessage", async (data) => {
      try {
        const { roomId, userid, message } = data;
        if (!roomId || !userid || !message) {
          console.error("❌ Missing roomId, userid, or message");
          return;
        }

        await mongoUtil.insertMessage(roomId, userid, message);
        io.to(roomId).emit("receiveMessage", {
          roomId,
          sender_id: userid,
          message,
        });
        console.log(`📩 Message sent in Room ${roomId} by User ${userid}`);
      } catch (error) {
        console.error("❌ Error sending message:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${socket.id} disconnected.`);
    });
  });

  console.log("🚀 Socket.io Server running on port 3000");
  // 🟢 Send message
  /*  socket.on("message_1v1", async ({ room_id, message }) => {
    const userId = socket.userId;
    const messageDetails = {
      user_id: userId,
      room_id: room_id,
      message: message,
      type: "message",
      created_at: new Date(),
      updated_at: new Date(),
    }; */

  /*     console.log(`📩 User ${userId} -> Room ${room_id}:`, message);

    try {
      await mongoUtil.insertOne("messages", messageDetails);
      io.to(room_id).emit("message_1v1_receiver", messageDetails);
      console.log(`✅ Message sent in Room ${room_id}`);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      socket.emit("error", { message: "Error sending message!" });
    }
  }); */

  // 🟢 Create a new chat room
  /*   socket.on("start_chat", async ({ user1_id, user2_id }) => {
    try {
      const room = await sqlUtil.createRoomIfNotExists(user1_id, user2_id);
      socket.join(`room_${room.id}`);
      console.log(`✅ Users joined Room: room_${room.id}`);
      io.to(`room_${room.id}`).emit("chat_started", { roomId: room.id });
    } catch (error) {
      console.error("❌ Error starting chat:", error);
    }
  }); */

  // 🔴 Remove duplicate memory-based room handling
  // socket.on("create_room", () => { ... });  ❌ Removed

  // 🔴 Removed in-memory `rooms` handling to prevent conflicts

  // 🟢 Leave Room
  /*   socket.on("leave_room", ({ room_id }) => {
    socket.leave(room_id);
    console.log(`🚪 User ${socket.userId} left Room: ${room_id}`);
    io.to(room_id).emit("user_left", { user_id: socket.userId });
  });

  // 🟢 Disconnect
  socket.on("disconnect", () => {
    onlineUserIdsSet.delete(userIdStr);
    io.emit(`return_online_status_${userIdStr}`, { online_status: false });
    console.log(`❌ User ${userIdStr} disconnected.`);
  }); */

  return io;
}

module.exports = { setupSocketServer, initializeMongoConnection };
