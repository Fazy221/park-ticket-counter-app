import { Platform } from "react-native";

// Plan section 8 calls for Inter or Manrope. Inter is loaded via
// @expo-google-fonts/inter (see app/_layout.tsx); until it's loaded these
// names fall back to the platform system font so there's never a blank
// frame.
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const systemFallback = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

export const type = {
  h1: { fontSize: 28, lineHeight: 34 },
  h2: { fontSize: 22, lineHeight: 28 },
  h3: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  // Assigned-number callout - the one number staff actually read off the
  // screen, needs to be legible from arm's length.
  callout: { fontSize: 48, lineHeight: 54 },
};
