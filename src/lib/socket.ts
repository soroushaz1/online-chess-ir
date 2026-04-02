import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io("/", {
      transports: ["websocket"],
      path: "/socket.io",
    });
  }

  return socket;
}
