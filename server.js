const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


io.on("connection", (socket) => {
  console.log("Użytkownik połączony:", socket.id);

  // Drawing pixels
  socket.on("draw_pixel", (data) => {
    socket.broadcast.emit("draw_pixel", data);
  });

  // Clear canvas
  socket.on("clear_canvas", () => {
    socket.broadcast.emit("clear_canvas");
  });

  socket.on("resizeBtn", (data) => {
    socket.broadcast.emit("resize_canvas", data);
    socket.broadcast.emit("resizeBtn", data);
  });

  // Undo / Redo synchronization
  socket.on("undo_action", (data) => {
    socket.broadcast.emit("load_canvas_state", data);
  });

  socket.on("redo_action", (data) => {
    socket.broadcast.emit("load_canvas_state", data);
  });

  // NOWE: Synchronizacja wczytywania obrazów
  socket.on("load_canvas_state", (data) => {
    // Wyślij stan canvas do wszystkich innych klientów
    socket.broadcast.emit("load_canvas_state", data);
  });

  // Canvas state transfer for new clients
  socket.on("send_canvas_state", (data) => {
    socket.broadcast.emit("load_canvas_state", data);
  });

  socket.on("new_client_ready", () => {
    socket.broadcast.emit("request_canvas_state");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Użytkownik rozłączony:", socket.id);
  });
});

const PORT = 3009;
server.listen(PORT, () => {
  console.log(`✅ Pixel Art Editor działa na http://localhost:${PORT}`);
});