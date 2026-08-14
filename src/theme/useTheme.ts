import { use } from "react";
import { ThemeContext, type ThemeContextValue } from "./context";

export function useTheme(): ThemeContextValue {
  return use(ThemeContext);
}
