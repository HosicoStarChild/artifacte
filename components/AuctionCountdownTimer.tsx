"use client";

import { useState, useEffect } from "react";

interface CountdownProps {
  endTime: number; // Unix timestamp in seconds
  onEnded?: () => void;
}

export function AuctionCountdownTimer({ endTime, onEnded }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isEnded: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isEnded: false,
  });

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true });
        if (onEnded) onEnded();
        return;
      }

      const days = Math.floor(diff / (24 * 60 * 60));
      const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60));
      const minutes = Math.floor((diff % (60 * 60)) / 60);
      const seconds = diff % 60;

      setTimeLeft({ days, hours, minutes, seconds, isEnded: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, onEnded]);

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 1;

  if (timeLeft.isEnded) {
    return (
      <div className="text-center">
        <div className="text-2xl font-serif text-red-400">Auction Ended</div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-4 gap-3 ${isUrgent ? "bg-red-900/20 border border-red-700 rounded-lg p-4" : ""}`}>
      {[
        { value: timeLeft.days, label: "Days" },
        { value: timeLeft.hours, label: "Hours" },
        { value: timeLeft.minutes, label: "Minutes" },
        { value: timeLeft.seconds, label: "Seconds" },
      ].map((item, idx) => (
        <div
          key={idx}
          className={`flex flex-col items-center justify-center p-3 rounded-lg ${
            isUrgent
              ? "bg-red-900/40 border border-red-700"
              : "bg-dark-700 border border-white/10"
          }`}
        >
          <div className={`text-xl font-bold ${isUrgent ? "text-red-400" : "text-white"}`}>
            {String(item.value).padStart(2, "0")}
          </div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
