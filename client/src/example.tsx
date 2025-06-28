import { useEffect, useRef, useState } from "react";
import { throttle, debounce } from "./utils";

interface ContentPayload {
  content: string;
  position: {
    x: number;
    y: number;
  };
}

interface WSMessage {
  type: string;
  data: ContentPayload;
}

export default function DocPage() {
  const ws = useRef<WebSocket | null>(null);
  const contentArea = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const lastLocalContent = useRef<string>("");
  const isProcessingRemoteUpdate = useRef<boolean>(false);

  const throttleRef = useRef(
    throttle((payload: ContentPayload) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: "content",
            data: payload,
          })
        );
      }
    }, 200)
  );

  const debounceRef = useRef(
    debounce((payload: ContentPayload) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: "content",
            data: payload,
          })
        );
      }
    }, 400)
  );

  useEffect(() => {
    // Create WebSocket connection
    ws.current = new WebSocket("ws://localhost:8080/ws");

    ws.current.addEventListener("open", () => {
      console.log("Socket connected!");
      setIsConnected(true);
    });

    ws.current.addEventListener("close", () => {
      setIsConnected(false);
    });

    ws.current.addEventListener("message", handleServerResponse);

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleServerResponse = (event: MessageEvent) => {
    try {
      const parsedData = JSON.parse(event.data) as WSMessage;

      if (parsedData.type === "content") {
        const remoteContent = parsedData.data.content;

        if (remoteContent === lastLocalContent.current) {
          console.log("Ignoring echo of our own update");
          return;
        }

        applyRemoteUpdate(remoteContent);
      }
    } catch (error) {
      console.error("Error handling server response:", error);
    }
  };

  const applyRemoteUpdate = (remoteContent: string): void => {
    if (!contentArea.current) return;

    isProcessingRemoteUpdate.current = true;

    try {
      const selection = window.getSelection();
      let savedRange: Range | null = null;

      if (selection && selection.rangeCount > 0) {
        savedRange = selection.getRangeAt(0).cloneRange();
      }

      const scrollTop = contentArea.current.scrollTop;
      const scrollLeft = contentArea.current.scrollLeft;

      contentArea.current.innerHTML = remoteContent;

      contentArea.current.scrollTop = scrollTop;
      contentArea.current.scrollLeft = scrollLeft;

      if (savedRange && selection) {
        try {
          selection.removeAllRanges();
          selection.addRange(savedRange);
          contentArea.current.focus();
        } catch (e) {
          console.log(
            "Could not restore selection - DOM structure changed too much",
            e
          );
        }
      }
    } catch (error) {
      console.error("Error applying remote update:", error);
    } finally {
      isProcessingRemoteUpdate.current = false;
    }
  };

  const handleInputTyping = (e: React.FormEvent<HTMLDivElement>) => {
    if (isProcessingRemoteUpdate.current || !e.currentTarget) {
      return;
    }

    const content = e.currentTarget.innerHTML;

    lastLocalContent.current = content;

    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();

    if (!rect) return;

    const payload = {
      content,
      position: {
        x: rect.left,
        y: rect.top,
      },
    };

    throttleRef.current(payload);
    debounceRef.current(payload);
  };

  return (
    <div className="bg-gray-100 min-h-screen p-4 flex flex-col items-center">
      <div className="mb-4">
        <span
          className={`inline-block w-3 h-3 rounded-full mr-2 ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        ></span>
        <span>{isConnected ? "Connected" : "Disconnected"}</span>
      </div>

      <div
        className="bg-white h-[1124px] w-[784px] p-8 shadow-md relative"
        contentEditable
        ref={contentArea}
        onInput={handleInputTyping}
      ></div>
    </div>
  );
}
