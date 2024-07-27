<template>
  <div id="app" class="container">
    <div class="login" v-if="!state.username">
      <form @submit.prevent="login">
        <h1>VueChat</h1>
        <input
          type="text"
          placeholder="Please enter your name ..."
          v-model="inputLogin"
        />
        <button type="submit">Login</button>
        <button type="button" @click="googleLogin">
          Login with Google account
        </button>
      </form>
    </div>
    <div class="chat" v-else>
      <header>
        <div class="header-user">
          <button class="sidebar-toggle" @click="toggleSidebar">☰</button>
          <div class="user-icon">
            <img
              class="user-icon"
              v-if="state.img"
              :src="state.img"
              alt="User profile image"
            />
          </div>
          <h2>{{ state.username }}</h2>
        </div>
        <div class="header-logout" @click="logout">Logout</div>
      </header>
      <div class="main-box">
        <main class="user-box" :class="{ collapsed: isSidebarCollapsed }">
          <div
            class="message-box"
            v-for="user in filteredUsers"
            :key="user.id"
            @click="createPrivateRoom(user)"
            style="position: relative; cursor: pointer"
          >
            <span class="isLoggin" v-show="user.isLoggedIn == true"></span>
            <img
              v-if="user.img"
              class="user-icon"
              v-show="user.img"
              :src="user.img"
              alt="User profile image"
            />
            <div v-if="!isSidebarCollapsed && user.username">
              {{ user.username.split(" ")[0] }}
            </div>
          </div>
        </main>
        <main class="chat-box" ref="chatBox">
          <div
            class="message-box"
            :class="state.username === message.username ? 'current-user' : ''"
            v-for="message in state.messages"
            :key="message.id"
          >
            <div class="user-icon">
              <img
                class="user-icon"
                v-if="message.img"
                :src="message.img"
                alt="User profile image"
              />
            </div>
            <div class="message">{{ message.body }}</div>
          </div>
          <div v-if="state.otherUserTyping" class="typing-indicator">
            {{ state.otherUserTyping }} is typing...
          </div>
        </main>
      </div>
      <footer>
        <form @submit.prevent="sendMessage">
          <input
            type="text"
            placeholder="Write a message ..."
            v-model="inputMessage"
            @input="handleTypingStart"
            @blur="handleTypingStop"
          />
          <button type="submit">Send</button>
        </form>
      </footer>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from "vue";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Howl } from "howler";
import db from "./db";

export default {
  setup() {
    const inputLogin = ref("");
    const inputMessage = ref("");
    const typingTimeout = ref(null);
    const chatBox = ref(null);

    const state = reactive({
      username: "",
      messages: [],
      users: [],
      img: null,
      isLoggedIn: null,
      typing: null,
      to: null,
      currentRoom: null,
      otherUserTyping: null,
    });

    const isSidebarCollapsed = ref(false);

    const notificationSound = new Howl({
      src: ["path/to/notification.mp3"],
    });

    const login = () => {
      if (inputLogin.value) {
        state.username = inputLogin.value;
        state.isLoggedIn = true;
        updateUserStatus(state.isLoggedIn);
        inputLogin.value = "";
      }
    };

    const logout = () => {
      const auth = getAuth();
      const user = auth.currentUser;
      auth
        .signOut()
        .then(() => {
          state.username = "";
          state.img = null;
          state.isLoggedIn = false;
          updateUserStatus(state.isLoggedIn, user.uid);
        })
        .catch((error) => {
          console.error("Logout Failed:", error);
        });
    };

    const googleLogin = async () => {
      const provider = new GoogleAuthProvider();
      const auth = getAuth();
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        state.username = user.displayName;
        state.img = user.photoURL;
        state.to = user.uid;
        state.isLoggedIn = true;
        updateUserStatus(state.isLoggedIn, user.uid);
      } catch (error) {
        console.error("Login Failed:", error);
      }
    };

    const updateUserStatus = (
      isLoggedIn,
      userId = getAuth().currentUser?.uid
    ) => {
      const usersRef = db.database().ref("users/" + userId);
      usersRef.update({
        username: state.username,
        img: state.img,
        isLoggedIn,
      });
    };

    const sendMessage = () => {
      const messagesRef = db.database().ref("messages/" + state.currentRoom);
      if (inputMessage.value === "" || inputMessage.value === null) {
        return;
      }
      const message = {
        username: state.username,
        img: state.img,
        to: state.to,
        body: inputMessage.value,
      };
      messagesRef.push(message);
      inputMessage.value = "";
      handleTypingStop();
      scrollToBottom();
    };

    const createPrivateRoom = (user) => {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const roomId = [currentUser.uid, user.id].sort().join("-");
        state.currentRoom = roomId;
        state.to = user.id;
        loadMessages(roomId);
        listenForTyping(roomId);
      }
    };

    const loadMessages = (roomId) => {
      const messagesRef = db.database().ref("messages/" + roomId);
      messagesRef.on("value", (snapshot) => {
        const data = snapshot.val();
        let messages = [];
        Object.keys(data || {}).forEach((key) => {
          messages.push({
            id: key,
            username: data[key].username,
            img: data[key].img,
            to: data[key].to,
            body: data[key].body,
          });
        });

        if (state.messages.length < messages.length) {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage.username !== state.username) {
            notificationSound.play();
          }
        }

        state.messages = messages;
        scrollToBottom();
      });
    };

    const listenForTyping = (roomId) => {
      const typingRef = db.database().ref("typing/" + roomId);
      typingRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (data && data.username !== state.username) {
          state.otherUserTyping = data.username;
        } else {
          state.otherUserTyping = null;
        }
      });
    };

    const handleTypingStart = () => {
      if (typingTimeout.value) {
        clearTimeout(typingTimeout.value);
      }
      updateTypingStatus(true);
      typingTimeout.value = setTimeout(() => {
        updateTypingStatus(false);
      }, 3000);
    };

    const handleTypingStop = () => {
      if (typingTimeout.value) {
        clearTimeout(typingTimeout.value);
      }
      updateTypingStatus(false);
    };

    const updateTypingStatus = (isTyping) => {
      const typingRef = db.database().ref("typing/" + state.currentRoom);
      if (isTyping) {
        typingRef.set({ username: state.username });
      } else {
        typingRef.remove();
      }
    };

    const toggleSidebar = () => {
      isSidebarCollapsed.value = !isSidebarCollapsed.value;
    };

    const filteredUsers = computed(() =>
      state.users.filter((user) => user.username !== state.username)
    );

    const scrollToBottom = () => {
      if (chatBox.value) {
        chatBox.value.scrollTop = chatBox.value.scrollHeight;
      }
    };

    onMounted(() => {
      const usersRef = db.database().ref("users");

      usersRef.on("child_added", (snapshot) => {
        const data = snapshot.val();
        state.users.push({
          id: snapshot.key,
          username: data.username,
          img: data.img,
          isLoggedIn: data.isLoggedIn,
        });
      });

      usersRef.on("child_changed", (snapshot) => {
        const data = snapshot.val();
        const index = state.users.findIndex((u) => u.id === snapshot.key);
        if (index !== -1) {
          state.users[index] = {
            id: snapshot.key,
            username: data.username,
            img: data.img,
            isLoggedIn: data.isLoggedIn,
          };
        }
      });

      scrollToBottom();
    });

    return {
      inputLogin,
      inputMessage,
      login,
      logout,
      state,
      sendMessage,
      googleLogin,
      createPrivateRoom,
      toggleSidebar,
      filteredUsers,
      isSidebarCollapsed,
      isLoggedIn: state.isLoggedIn,
      handleTypingStart,
      handleTypingStop,
      chatBox,
    };
  },
};
</script>

<style>
*,
*:after,
*:before {
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

body {
  font-family: "Roboto", sans-serif;
  width: 100vw;
  min-height: 95vh;
  overflow-x: hidden;
  background-color: #f0f2f5;
}

.container {
  margin: 5vh auto 0;
  min-height: 90vh;
  background-color: #ffffff;
  width: 70%;
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.login {
  height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
}

.login form {
  width: 90%;
  background-color: #ffffff;
  border-radius: 20px;
  padding: 3rem 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  color: #5d5a72;
}

.login h1 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #002768;
}

.login input {
  width: 100%;
  border-radius: 10rem;
  background-color: #f9f9f9;
  padding: 0.8rem;
  border: 1px solid #ddd;
  margin-bottom: 1rem;
}

.login button {
  display: block;
  width: 100%;
  text-align: center;
  font-size: 1rem;
  font-weight: bold;
  margin-top: 1rem;
  background-color: #ba1c3b;
  cursor: pointer;
  border-radius: 10rem;
  padding: 0.8rem;
  border: none;
  outline: none;
  color: #fff;
  transition: background-color 0.3s;
}

.login button:hover {
  background-color: #9e162f;
}

.isLoggin {
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  padding: 0;
  background-color: lawngreen;
}

input {
  background-color: #f3f4f6;
  border: none;
  outline: none;
  padding: 0.5rem 1rem;
}

.chat {
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  min-height: 90vh;
}

header {
  position: sticky;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 10;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #fff;
  background-color: #002768;
  border-bottom: 1px solid #001a4d;
}

header h2 {
  font-size: 1.5rem;
  color: #fff;
}

.header-user {
  display: flex;
  align-items: center;
}

.sidebar-toggle {
  font-size: 1.5rem;
  margin-right: 1rem;
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
}

.user-icon {
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1rem;
  position: relative;
}

.header-user .user-icon {
  background-color: #fff;
  color: #002768;
  margin-right: 0.5rem;
  font-weight: bold;
}

.header-logout {
  transition: background-color 0.3s;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  background-color: #ba1c3b;
  color: #fff;
}

.header-logout:hover {
  background-color: #9e162f;
}

.main-box {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
  /* padding-top: 70px; */
}

.user-box {
  background-color: #002768;
  color: #fff;
  padding: 1rem;
  transition: width 0.3s, background-color 0.3s;
  width: 25%;
  overflow-y: auto;
  margin-right: 7px;
}

.user-box.collapsed {
  width: 9%;
}

.user-box .message-box {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  margin-bottom: 1rem;
  background-color: #004080;
  border-radius: 10px;
  transition: background-color 0.3s;
}

.user-box .message-box:hover {
  background-color: #003366;
}

.user-box .message-box .user-icon {
  width: 2.5rem;
  height: 2.5rem;
  margin-right: 0.5rem;
  position: relative;
}

.user-box .message-box .isLoggin {
  bottom: 5px;
  right: 5px;
}

.user-box.collapsed .message-box .user-icon {
  margin: auto;
}

.user-box.collapsed .message-box .message-box {
  display: none;
}

.chat-box {
  background-color: #fff;
  flex-grow: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  border-top-right-radius: 20px;
  border-top-left-radius: 20px;
  overflow-y: auto;
  height: calc(90vh - 120px);
  /* Adjust based on header height */
}

.chat-box::-webkit-scrollbar-track {
  border-radius: 10px;
  background-color: transparent;
}

.chat-box::-webkit-scrollbar {
  width: 4px;
  background-color: transparent;
  border-radius: 10px;
}

.chat-box::-webkit-scrollbar-thumb {
  border-radius: 10px;
  background-color: rgba(66, 69, 129, 0.3);
  transition: background-color 0.3s;
}

.message-box {
  display: flex;
  margin-bottom: 1rem;
  position: relative;
  flex-shrink: 1;
}

.message-box .message {
  background-color: #f1f0f5;
  color: #666380;
  padding: 0.5rem 1rem;
  border-radius: 7px;
}

.message-box .user-icon {
  background-color: #f1f0f5;
  color: #7d799b;
  flex-shrink: 0;
  margin-right: 0.5rem;
  position: relative;
}

.message-box.current-user {
  align-self: flex-end;
}

.message-box.current-user .user-icon {
  background-color: #7d799b;
  color: #fff;
  order: 2;
  margin-right: 0;
  margin-left: 0.5rem;
}

.message-box.current-user .message {
  background-color: #ba1c3b;
  color: #ffffff;
}

.typing-indicator {
  font-style: italic;
  color: #888;
  margin-top: 1rem;
}

footer {
  background: #fff;
  border-top-left-radius: 20px;
}

footer form {
  background: #002768;
  padding: 1rem;
  border-top-right-radius: 20px;
  border-top-left-radius: 20px;
  display: flex;
}

footer button {
  border: none;
  outline: none;
  padding: 0.5rem 1rem;
  font-weight: bold;
  background: #ba1c3b;
  border-top-right-radius: 10rem;
  border-bottom-right-radius: 10rem;
  color: #fff;
  cursor: pointer;
}

footer input {
  flex-grow: 1;
  border-top-left-radius: 10rem;
  border-bottom-left-radius: 10rem;
}

/* Responsive Styles */
@media (max-width: 1024px) {
  .container {
    width: 80%;
  }

  .user-box {
    width: 25%;
  }

  .user-box.collapsed {
    width: 10%;
  }
}

@media (max-width: 768px) {
  .container {
    width: 90%;
  }

  header h2 {
    font-size: 1.2rem;
  }

  .user-box {
    width: 30%;
  }

  .user-box.collapsed {
    width: 13.5%;
  }

  .chat-box {
    padding: 0.5rem;
  }

  .message-box {
    max-width: 100%;
  }

  .message-box .message {
    font-size: 0.9rem;
  }

  footer form {
    padding: 0.5rem;
  }
}

@media (max-width: 480px) {
  .container {
    width: 95%;
  }

  header h2 {
    font-size: 1rem;
  }

  .user-box {
    width: 43%;
  }

  .user-box.collapsed {
    width: 22%;
  }

  .chat-box {
    padding: 0.5rem;
  }

  .message-box {
    max-width: 100%;
  }

  .message-box .message {
    font-size: 0.8rem;
  }

  footer form {
    padding: 0.5rem;
  }

  footer button {
    font-size: 0.8rem;
  }

  footer input {
    font-size: 0.8rem;
  }
}
</style>
