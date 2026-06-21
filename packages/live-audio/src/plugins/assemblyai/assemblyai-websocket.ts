const WEBSOCKET_OPEN_STATE = 1;

type AssemblyAiWebSocketData = string | ArrayBuffer;

export type AssemblyAiWebSocket = {
  close: () => void;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  readyState: number;
  send: (data: AssemblyAiWebSocketData) => void;
};

export type AssemblyAiWebSocketFactory = (url: string) => AssemblyAiWebSocket;

export function createBrowserAssemblyAiWebSocket(
  url: string,
): AssemblyAiWebSocket {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const wrappedSocket: AssemblyAiWebSocket = {
    close: () => socket.close(),
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    get readyState() {
      return socket.readyState;
    },
    send: (data) => socket.send(data),
  };
  socket.onclose = () => wrappedSocket.onclose?.();
  socket.onerror = () => wrappedSocket.onerror?.();
  socket.onmessage = (event) => wrappedSocket.onmessage?.(event);
  socket.onopen = () => wrappedSocket.onopen?.();
  return wrappedSocket;
}

export function isAssemblyAiWebSocketOpen(socket: AssemblyAiWebSocket) {
  return socket.readyState === WEBSOCKET_OPEN_STATE;
}
