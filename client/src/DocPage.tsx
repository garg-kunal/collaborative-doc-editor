import { useEffect, useRef, useState } from "react";
import { throttle, debounce } from "./utils";

type UserDataType = {
  userId: string | null;
  userName: string | null;
  userColor: string | null;
};

interface UserCursor {
  userData: UserDataType;
  position: { x: number; y: number };
}

interface ContentPayload {
  content: string;
  position: { x: number; y: number };
  userData: UserDataType;
}

interface WSMessage {
  type: string;
  data: ContentPayload;
}

export default function DocPage() {
  const ws = useRef<WebSocket | null>(null);
  const contentArea = useRef<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const userDataRef = useRef<UserDataType>({
    userId: null,
    userName: "",
    userColor: "",
  });
  const [userCursors, setUserCursors] = useState<Array<UserCursor>>([]);
  const [users, setUsers] = useState<Array<UserDataType>>([]);

  const throttleRef = useRef(
    throttle((payload: ContentPayload) => {
      ws.current?.send(
        JSON.stringify({
          type: "content",
          data: payload,
        })
      );
    }, 200)
  );

  const debounceRef = useRef(
    debounce((payload: ContentPayload) => {
      ws.current?.send(
        JSON.stringify({
          type: "content",
          data: payload,
        })
      );
    }, 400)
  );

  const applyRemoteUpdate = (remoteContent: string): void => {
    if (!contentArea.current) return;

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
    }
  };

  const handleUserCursors = (data: ContentPayload) => {
    const userId = data.userData.userId;

    setUserCursors((prevCursors) => {
      const filteredCursorPositions = prevCursors.filter(
        (item: UserCursor) => item.userData.userId !== userId
      );

      if (userDataRef.current.userId === userId) {
        return filteredCursorPositions;
      }

      return [
        ...filteredCursorPositions,
        {
          userData: data.userData,
          position: { ...data.position },
        },
      ];
    });
  };

  const addNewUser = (user: UserDataType) => {
    setUsers((prevUsers) => [...prevUsers, user]);
  };

  const removeUser = (user: UserDataType) => {
    setUsers((prevUsers) => prevUsers.filter((u) => u.userId !== user.userId));
  };

  const handleServerResponse = (event: MessageEvent) => {
    const parsedData = JSON.parse(event.data) as WSMessage;
    const eventType = parsedData.type;

    if (eventType === "content") {
      if (parsedData.data.userData.userId !== userDataRef.current.userId) {
        applyRemoteUpdate(parsedData.data.content);
        handleUserCursors(parsedData.data);
      }
    }

    if (eventType === "user-data") {
      userDataRef.current = parsedData.data.userData;
    }

    if (eventType === "user-added") {
      addNewUser(parsedData.data.userData);
    }

    if (eventType === "user-removed") {
      removeUser(parsedData.data.userData);
    }
  };

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8080/ws");

    ws.current.addEventListener("open", () => {
      console.log("Socket connected!");
      setIsConnected(true);
    });
    ws.current.addEventListener("message", handleServerResponse);

    return () => ws.current?.close();
  }, []);

  const handleInputTyping = (
    e: React.FormEvent<HTMLDivElement> | undefined
  ) => {
    if (!e) {
      return;
    }

    const sel = window.getSelection();
    const range = sel?.getRangeAt(0);

    const rect = range?.getBoundingClientRect();
    if (!rect || rect.top <= 0) return;

    const payload: ContentPayload = {
      content: e.currentTarget.innerHTML,
      position: {
        x: rect?.left,
        y: rect?.top,
      },
      userData: userDataRef.current,
    };

    throttleRef.current(payload);
    debounceRef.current(payload);
  };

  return (
    <div className="bg-gray-100 relative min-h-screen flex flex-col items-center">
      <div className="bg-white mb-4 p-4 flex justify-between shadow-md w-full">
        <span className="text-xl font-bold">Custom Docs</span>
        <div>
          <span className="mr-4 font-bold">{userDataRef.current.userName}</span>
          <span
            className={`inline-block w-3 h-3 rounded-full mr-2 ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></span>
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        <div className="flex gap-2 truncate max-w-48">
          {users.map((user: UserDataType, index: number) => {
            return (
              <div
                key={user.userId}
                className={`text-white px-2 py-1 rounded-full ${
                  index > 0 && "-ml-4"
                }`}
                style={{ background: `${user.userColor}` }}
                title={user.userName ?? ""}
              >
                {user.userName?.slice(0, 2)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <div
          className="bg-white h-[1124px] w-[784px] p-8 shadow-md"
          contentEditable
          ref={contentArea}
          onInput={handleInputTyping}
        ></div>

        {userCursors.map((item: UserCursor, index: number) => {
          if (!contentArea.current) return null;

          const containerRect = contentArea.current.getBoundingClientRect();
          const relativeX = item.position.x - containerRect.left - 20;
          const relativeY = item.position.y - containerRect.top;

          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${relativeX}px`,
                top: `${relativeY}px`,
                transform: "translateY(-60%)",
                zIndex: 1000,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: item.userData.userColor ?? "",
                  color: "#fff",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                {item.userData.userName}
              </div>
              <div
                style={{
                  width: "2px",
                  height: "16px",
                  backgroundColor: item.userData.userColor ?? "",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
