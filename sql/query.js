require("dotenv").config();
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

class SqlUtil {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      port: process.env.SQL_PORT,
      database: process.env.SQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  async findRoom(user1_id, user2_id) {
    const [rows] = await this.pool.query(
      `SELECT * FROM message_rooms 
             WHERE (user1_id = ? AND user2_id = ?) 
                OR (user1_id = ? AND user2_id = ?) 
             LIMIT 1`,
      [user1_id, user2_id, user2_id, user1_id]
    );
    return rows.length ? rows[0] : null;
  }

  // Create a new room
  /*   async createRoom(user1_id, user2_id) {
    try {
      // Check if the room already exists
      let existingRoom = await this.findRoom(user1_id, user2_id);
      if (existingRoom) return existingRoom;

      // Insert new room
      const [result] = await this.pool.query(
        "INSERT INTO message_rooms (user1_id, user2_id) VALUES (?, ?)",
        [user1_id, user2_id]
      );

      // Fetch the newly created room
      return {
        id: result.insertId,
        user1_id,
        user2_id,
        created_at: new Date(),
        updated_at: new Date(),
      };
    } catch (error) {
      console.error("Error creating room:", error);
      throw error;
    }
  } */

  async findRoom(user1_id, user2_id) {
    const [rows] = await this.pool.query(
      `SELECT * FROM message_rooms 
       WHERE (user1_id = ? AND user2_id = ?) 
          OR (user1_id = ? AND user2_id = ?) 
       LIMIT 1`,
      [user1_id, user2_id, user2_id, user1_id]
    );
    return rows.length ? rows[0] : null;
  }

  // Create room if it doesn't exist
  async createRoom(user1_id, user2_id) {
    try {
      const sortedUsers = [
        Math.min(user1_id, user2_id),
        Math.max(user1_id, user2_id),
      ];
      user1_id = sortedUsers[0];
      user2_id = sortedUsers[1];

      let existingRoom = await this.findRoom(user1_id, user2_id);
      if (existingRoom) return existingRoom;

      const room_uuid = uuidv4();

      const [result] = await this.pool.query(
        "INSERT INTO message_rooms (room_uuid, user1_id, user2_id) VALUES (?, ?, ?)",
        [room_uuid, user1_id, user2_id]
      );

      return { id: result.insertId, room_uuid, user1_id, user2_id };
    } catch (error) {
      console.error("❌ Error creating room:", error);
      throw error;
    }
  }

  /**
   * ✅ Retrieve Chat History for a Room
   */
  async getChatHistory(room_uuid) {
    try {
      const [messages] = await this.pool.query(
        "SELECT * FROM messages WHERE room_uuid = ? ORDER BY created_at ASC",
        [room_uuid]
      );

      return messages;
    } catch (error) {
      console.error("❌ Error Fetching Chat History:", error);
      throw new Error("Failed to fetch chat history");
    }
  }

  /**
   * ✅ General Query Function
   */
  async query(sql, params = []) {
    const [results] = await this.pool.query(sql, params);
    return results;
  }
  //////////////////  //////////////////  //////////////////  //////////////////  //////////////////  //////////////////

  // Create Room in MySQL and Save in MongoDB
  async createRoomIfNotExists(user1_id, user2_id) {
    let room = await this.findRoom(user1_id, user2_id);
    if (room) {
      console.log("✅ Room Exists:", room.id);
      return room; // Return existing room
    }

    // Create a new room in MySQL
    const [result] = await this.pool.query(
      `INSERT INTO message_rooms (user1_id, user2_id) VALUES (?, ?)`,
      [user1_id, user2_id]
    );

    const room_id = result.insertId;
    console.log("✅ New Room Created:", room_id);

    // Save the room details in MongoDB
    const mongoRoom = new MessageRoomMongo({ room_id, user1_id, user2_id });
    await mongoRoom.save();

    return { id: room_id, user1_id, user2_id };
  }

  async query(sql, params = []) {
    const [results] = await this.pool.query(sql, params);
    return results;
  }

  async find(table, condition = "", params = []) {
    const sql = `SELECT * FROM ${table} ${condition}`;
    return await this.query(sql, params);
  }

  async update(table, data, condition) {
    const updates = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const conditionClause = Object.keys(condition)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const sql = `UPDATE ${table} SET ${updates} WHERE ${conditionClause}`;

    return await this.query(sql, [
      ...Object.values(data),
      ...Object.values(condition),
    ]);
  }

  async delete(table, condition) {
    const sql = `DELETE FROM ${table} WHERE ${condition}`;
    return await this.query(sql);
  }

  async findWithJoin(selectQuery, joinQuery, whereQuery = "", params = []) {
    const sql = `${selectQuery} ${joinQuery} ${whereQuery}`;
    return await this.query(sql, params);
  }

  async updateWithJoin(
    updateTable,
    updateData,
    joinQuery,
    whereQuery,
    params = []
  ) {
    const updates = Object.keys(updateData)
      .map((key) => `${updateTable}.${key} = ?`)
      .join(", ");
    const sql = `UPDATE ${updateTable} ${joinQuery} SET ${updates} ${whereQuery}`;
    return await this.query(sql, [...Object.values(updateData), ...params]);
  }

  async findAsArray(table, where = "", column = "id") {
    const sql = `SELECT * FROM ${table} where ${where} and deleted_at is null`;
    const results = await this.query(sql);
    return results.map((row) => row[column]);
  }

  async findAsArrayforFCM(table, where = "", column = "id") {
    let whereClause = where
      ? `WHERE ${where} AND deleted_at IS NULL`
      : "WHERE deleted_at IS NULL";
    const sql = `SELECT ${column} FROM ${table} ${whereClause} ORDER BY id DESC LIMIT 1`;
    const results = await this.query(sql);
    return results.map((row) => row[column]);
  }

  async insert(table, columns, values) {
    const placeholders = values.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} ${columns} VALUES (${placeholders})`;
    return await this.query(sql, values);
  }
}

module.exports = SqlUtil;
