import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "127.0.0.1";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

const httpServer = createServer(handler);

const io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("game:join", (gameId) => {
    socket.join(`game:${gameId}`);
  });

  socket.on("game:leave", (gameId) => {
    socket.leave(`game:${gameId}`);
  });
});

globalThis.io = io;

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
