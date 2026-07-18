import { io } from "socket.io-client";

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const socket = io("http://localhost:4000", {
  query: { workspaceId: WORKSPACE_ID },
  transports: ["websocket"],
});

let gotMessage = false;
let gotNotification = false;

function maybeExit() {
  if (gotMessage && gotNotification) {
    console.log("PASS: received both message.received and notification.created over WebSocket");
    process.exit(0);
  }
}

socket.on("connect", async () => {
  console.log("connected:", socket.id);
  const res = await fetch("http://localhost:4000/dev/mock-connector/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderDisplayName: "WebSocket Verify Bot",
      senderExternalId: "ws-verify-bot",
      bodyText: "Verifying the realtime pipeline end to end.",
    }),
  });
  console.log("mock-connector/send status:", res.status);
});

socket.on("message.received", (payload) => {
  console.log("WS message.received:", JSON.stringify(payload));
  gotMessage = true;
  maybeExit();
});

socket.on("notification.created", (payload) => {
  console.log("WS notification.created:", JSON.stringify(payload));
  gotNotification = true;
  maybeExit();
});

setTimeout(() => {
  console.error("FAIL: timed out waiting for events", { gotMessage, gotNotification });
  process.exit(1);
}, 8000);
