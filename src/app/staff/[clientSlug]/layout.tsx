import React from "react";
import { StaffShell } from "@/components/StaffShell";

export default function StaffClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffShell>{children}</StaffShell>;
}
