import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScannerPage } from "./scanner/ScannerPage.tsx";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("scan.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <ScannerPage />
  </StrictMode>,
);
