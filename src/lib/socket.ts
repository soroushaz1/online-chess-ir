import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io("http://localhost:3000", {
      transports: ["websocket"],
    });
  }

  return socket;
}