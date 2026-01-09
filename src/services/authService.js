import {
  getAuth,
  sendSignInLinkToEmail,
  linkWithCredential,
  signInWithEmailLink,
  isSignInWithEmailLink,
  EmailAuthProvider
} from "firebase/auth";

const auth = getAuth();

const actionCodeSettings = {
  url: window.location.origin,
  handleCodeInApp: true,
};

export const sendRecoveryLink = async (email) => {
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  window.localStorage.setItem("emailForRecovery", email);
};

export const completeRecovery = async () => {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;

  const email =
    window.localStorage.getItem("emailForRecovery") ||
    window.prompt("Confirm your email");

  const credential = EmailAuthProvider.credentialWithLink(
    email,
    window.location.href
  );

  const user = auth.currentUser;

  // 🔥 THIS IS THE MAGIC
  // If user is anonymous → link
  if (user?.isAnonymous) {
    await linkWithCredential(user, credential);
    window.localStorage.removeItem("emailForRecovery");
    return user;
  }

  // Otherwise normal sign-in
  const result = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem("emailForRecovery");
  return result.user;
};

