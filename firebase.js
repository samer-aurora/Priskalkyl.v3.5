// ============================================================
// SolarCPQ — FIREBASE INTEGRATION v3.5
// Firebase Firestore + Firebase Authentication
// Aurora Energy Group AB
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection,
  getDocs, deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── CONFIG ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCFjvuY_khEFzVBCXfIIJ_6kDfOteENiOY",
  authDomain: "projektering-aurora.firebaseapp.com",
  projectId: "projektering-aurora",
  storageBucket: "projektering-aurora.firebasestorage.app",
  messagingSenderId: "646951484494",
  appId: "1:646951484494:web:8c4c74acfd93713678971f"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── HELPER ──────────────────────────────────────────────────
function clean(obj) {
  // Remove undefined values — Firestore doesn't accept them
  return JSON.parse(JSON.stringify(obj));
}

function ts() {
  return new Date().toISOString();
}

// ─── FIREBASE AUTH ────────────────────────────────────────────
const FirebaseAuth = {
  async login(email, password) {
    try {
      await setPersistence(auth, browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: cred.user };
    } catch(e) {
      console.error("Login error:", e.code);
      return { success: false, error: e.code };
    }
  },

  async logout() {
    try {
      await signOut(auth);
      return true;
    } catch(e) {
      console.error("Logout error:", e);
      return false;
    }
  },

  onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
  },

  currentUser() {
    return auth.currentUser;
  },

  isLoggedIn() {
    return !!auth.currentUser;
  }
};

// ─── CLOUD DB ─────────────────────────────────────────────────
const CloudDB = {

  // ── PROJECTS ──────────────────────────────────────────────

  async getAllProjects() {
    try {
      const q = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        ...d.data(),
        projectId: d.data().projectId || d.id
      }));
    } catch(e) {
      console.error("CloudDB.getAllProjects:", e);
      return [];
    }
  },

  async getProject(id) {
    try {
      const snap = await getDoc(doc(db, "projects", id));
      return snap.exists() ? { ...snap.data(), projectId: snap.id } : null;
    } catch(e) {
      console.error("CloudDB.getProject:", e);
      return null;
    }
  },

  async saveProject(project) {
    try {
      const id = project.projectId;
      if (!id) return null;
      const data = clean({
        ...project,
        updatedAt: ts()
      });
      await setDoc(doc(db, "projects", id), data, { merge: true });
      return id;
    } catch(e) {
      console.error("CloudDB.saveProject:", e);
      return null;
    }
  },

  async updateProject(id, changes) {
    try {
      const data = clean({
        ...changes,
        updatedAt: ts()
      });
      await setDoc(doc(db, "projects", id), data, { merge: true });
      return true;
    } catch(e) {
      console.error("CloudDB.updateProject:", e);
      return false;
    }
  },

  async deleteProject(id) {
    try {
      await deleteDoc(doc(db, "projects", id));
      return true;
    } catch(e) {
      console.error("CloudDB.deleteProject:", e);
      return false;
    }
  },

  // Real-time listener for all projects (admin dashboard)
  onProjectsChange(callback) {
    try {
      const q = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
      return onSnapshot(q, snap => {
        const projects = snap.docs.map(d => ({
          ...d.data(),
          projectId: d.data().projectId || d.id
        }));
        callback(projects);
      }, err => {
        console.error("onProjectsChange error:", err);
      });
    } catch(e) {
      console.error("CloudDB.onProjectsChange:", e);
      return () => {};
    }
  },

  // Real-time listener for a single project (customer detail view)
  onProjectChange(id, callback) {
    try {
      return onSnapshot(doc(db, "projects", id), snap => {
        if (snap.exists()) callback({ ...snap.data(), projectId: snap.id });
      });
    } catch(e) {
      console.error("CloudDB.onProjectChange:", e);
      return () => {};
    }
  },

  // ── PRODUCT CATALOG ───────────────────────────────────────

  async getProductCatalog() {
    try {
      const snap = await getDoc(doc(db, "settings", "catalog"));
      return snap.exists() ? snap.data() : null;
    } catch(e) {
      console.error("CloudDB.getProductCatalog:", e);
      return null;
    }
  },

  async saveProductCatalog(data) {
    try {
      await setDoc(doc(db, "settings", "catalog"), clean({
        ...data,
        updatedAt: ts()
      }));
      return true;
    } catch(e) {
      console.error("CloudDB.saveProductCatalog:", e);
      return false;
    }
  },

  // Real-time listener — customer sees price changes instantly
  onCatalogChange(callback) {
    try {
      return onSnapshot(doc(db, "settings", "catalog"), snap => {
        if (snap.exists()) callback(snap.data());
      });
    } catch(e) {
      console.error("CloudDB.onCatalogChange:", e);
      return () => {};
    }
  },

  // ── GLOBAL SETTINGS ───────────────────────────────────────

  async getSettings() {
    try {
      const snap = await getDoc(doc(db, "settings", "global"));
      return snap.exists() ? snap.data() : null;
    } catch(e) {
      console.error("CloudDB.getSettings:", e);
      return null;
    }
  },

  async saveSettings(settings) {
    try {
      await setDoc(doc(db, "settings", "global"), clean({
        ...settings,
        updatedAt: ts()
      }), { merge: true });
      return true;
    } catch(e) {
      console.error("CloudDB.saveSettings:", e);
      return false;
    }
  },

  // ── CHANGELOG ─────────────────────────────────────────────

  async logChange(projectId, action, userId = "unknown") {
    try {
      const logRef = doc(db, "changelog", `${Date.now()}_${Math.random().toString(36).slice(2)}`);
      await setDoc(logRef, clean({
        projectId,
        action,
        userId,
        timestamp: ts()
      }));
    } catch(e) {
      // Non-critical — don't throw
      console.warn("CloudDB.logChange:", e);
    }
  },

  // ── SEED ──────────────────────────────────────────────────

  // Push core.js DEFAULT_STATE to Firebase on first run
  async seedCatalogIfEmpty(products, settings) {
    try {
      const existing = await this.getProductCatalog();
      if (existing?.products?.batteries?.length > 0) {
        return false; // Already seeded
      }
      await this.saveProductCatalog({ products, settings, seededAt: ts() });
      console.log("Firebase catalog seeded from core.js v3.5");
      return true;
    } catch(e) {
      console.error("CloudDB.seedCatalog:", e);
      return false;
    }
  }
};

// ─── FIRESTORE SECURITY RULES ────────────────────────────────
// Deploy these via Firebase Console → Firestore → Rules
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /{document=**} {
//       allow read: if request.auth != null;
//     }
//     match /projects/{projectId} {
//       allow create, update: if request.auth != null;
//       allow delete: if request.auth != null;
//     }
//     match /settings/{settingId} {
//       allow write: if request.auth != null;
//     }
//     match /changelog/{logId} {
//       allow write: if request.auth != null;
//     }
//   }
// }

export { CloudDB, FirebaseAuth, auth, db };
