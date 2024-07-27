import firebase from "firebase/compat/app";
import "firebase/compat/database";

const firebaseConfig = {
  apiKey: "AIzaSyC8p6mRMJEuv0y4AFA6GP0fVPlQyyRAWhQ",
  authDomain: "brooklyn-chat.firebaseapp.com",
  databaseURL:
    "https://brooklyn-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "brooklyn-chat",
  storageBucket: "brooklyn-chat.appspot.com",
  messagingSenderId: "450185737947",
  appId: "1:450185737947:web:a7dce19db9e0b37478fefe",
};

const db = firebase.initializeApp(firebaseConfig);

export default db;
