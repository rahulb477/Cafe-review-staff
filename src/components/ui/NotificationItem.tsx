"use client";

import React from "react";
import { Bell, Coffee, Gift, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { StaffNotification, StaffNotificationType } from "@/services/types";

const TYPE_STYLES: Record<StaffNotificationType, { tile: string; Icon: typeof Bell }> = {
  STAMP_ADDED: { tile: "bg-clay-50 text-clay-600", Icon: Coffee },
  REWARD_READY: { tile: "bg-caramel-100 text-caramel-600", Icon: Gift },
  REWARD_REDEEMED: { tile: "bg-leaf-50 text-leaf-600", Icon: Gift },
  SYSTEM: { tile: "bg-espresso-50 text-espresso-600", Icon: Settings2 },
};

export interface NotificationItemProps {
  notification: StaffNotification;
  onSelect?: (notification: StaffNotification) => void;
  className?: string;
}

/**
 * A single real notification from clients/{clientId}/notifications.
 * Unread rows carry the caramel dot; tapping marks `read` in Firestore.
 */
export function NotificationItem({ notification, onSelect, className }: NotificationItemProps) {
  const { tile, Icon } = TYPE_STYLES[notification.type] ?? TYPE_STYLES.SYSTEM;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(notification)}
        aria-label={`${notification.title}. ${notification.message}`}
        className={cn(
          "press-scale flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left",
          notification.read ? "hover:bg-cream-200/70" : "bg-caramel-100/45 hover:bg-caramel-100/70",
          className
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md",
            tile
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[0.8rem] text-espresso-900",
                notification.read ? "font-semibold" : "font-extrabold"
              )}
            >
              {notification.title}
            </span>
            {!notification.read && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-caramel-500"
                aria-label="Unread"
              />
            )}
          </span>
          <span className="mt-0.5 block text-[0.72rem] font-medium leading-snug break-words text-espresso-500">
            {notification.message}
          </span>
          <span className="mt-1 block text-[0.66rem] font-medium text-espresso-300">
            {notification.createdAt || "Just now"}
          </span>
        </span>
      </button>
    </li>
  );
}
