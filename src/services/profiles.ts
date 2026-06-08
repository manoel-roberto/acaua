import { db } from "@/lib/firebase/client";
import { 
  collection, 
  getDocs, 
  setDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  query,
  orderBy
} from "firebase/firestore";
import { UserProfile } from "@/types";

// List all profiles sorted by full_name
export async function getProfiles(): Promise<(UserProfile & { id: string })[]> {
  const profilesRef = collection(db, "profiles");
  const q = query(profilesRef, orderBy("full_name", "asc"));
  const querySnapshot = await getDocs(q);
  
  const profiles: (UserProfile & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    profiles.push({ id: docSnap.id, ...docSnap.data() } as (UserProfile & { id: string }));
  });
  
  return profiles;
}

// Create a pre-registered profile using the email as document ID
export async function createPreProfile(
  email: string,
  profileData: Omit<UserProfile, "email" | "avatar_url" | "created_at" | "updated_at">
): Promise<void> {
  const now = new Date().toISOString();
  // Using email normalized as document ID or we can generate a random ID
  // Random ID is better because if we write to '/profiles/{email}' first,
  // then when they log in, they will have '/profiles/{uid}'.
  // This keeps the collection structure cleaner (and avoids issues if email contains characters that aren't nice in IDs)
  const profileDocRef = doc(collection(db, "profiles"));
  
  const newProfile: UserProfile = {
    ...profileData,
    email: email.trim().toLowerCase(),
    avatar_url: "",
    created_at: now,
    updated_at: now,
  };

  await setDoc(profileDocRef, newProfile);
}

// Update profile fields
export async function updateProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  const profileRef = doc(db, "profiles", uid);
  await updateDoc(profileRef, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
}

// Delete/Remove a profile document
export async function deleteProfile(uid: string): Promise<void> {
  const profileRef = doc(db, "profiles", uid);
  await deleteDoc(profileRef);
}
