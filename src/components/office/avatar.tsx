"use client";

export interface AvatarProps {
  skin: string;
  hair: string;
  shirt: string;
  gender: "male" | "female" | string;
  hairStyle?: "short" | "long" | "hijab" | "bun";
  glasses?: boolean;
  size?: number;
  className?: string;
}

/** شخصية كرتونية بسيطة لكل موظف */
export function EmployeeAvatar({
  skin,
  hair,
  shirt,
  gender,
  hairStyle,
  glasses,
  size = 44,
  className,
}: AvatarProps) {
  const style: "short" | "long" | "hijab" | "bun" =
    hairStyle ??
    (gender === "female" ? "long" : "short");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      {/* الجسم */}
      <path d="M18 62 C18 46 46 46 46 62 Z" fill={shirt} />
      {/* الرقبة */}
      <rect x="28" y="36" width="8" height="7" rx="3" fill={skin} />
      {/* الراس */}
      <circle cx="32" cy="26" r="14" fill={skin} />
      {/* الشعر / الحجاب */}
      {style === "short" && (
        <path d="M18 23 C19 11 45 11 46 23 L46 17 C44 7 20 7 18 17 Z" fill={hair} />
      )}
      {style === "long" && (
        <>
          <path d="M18 23 C19 11 45 11 46 23 L46 17 C44 7 20 7 18 17 Z" fill={hair} />
          <path d="M16 22 C15 38 18 44 21 44 L22 30 Z" fill={hair} />
          <path d="M48 22 C49 38 46 44 43 44 L42 30 Z" fill={hair} />
        </>
      )}
      {style === "hijab" && (
        <>
          <circle cx="32" cy="25" r="16.5" fill={hair} />
          <path d="M20 34 C14 44 16 52 20 54 L44 54 C48 52 50 44 44 34 Z" fill={hair} />
          <ellipse cx="32" cy="27" rx="10.5" ry="11" fill={skin} />
        </>
      )}
      {style === "bun" && (
        <>
          <circle cx="32" cy="10" r="5" fill={hair} />
          <path d="M18 23 C19 11 45 11 46 23 L46 17 C44 7 20 7 18 17 Z" fill={hair} />
        </>
      )}
      {/* العيون */}
      <circle cx="26.5" cy="27" r="1.8" fill="#26221d" />
      <circle cx="37.5" cy="27" r="1.8" fill="#26221d" />
      {/* الابتسامة */}
      <path d="M28 32 C30 34.5 34 34.5 36 32" stroke="#26221d" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* النظارة */}
      {glasses && (
        <g stroke="#26221d" strokeWidth="1.3" fill="none" opacity="0.85">
          <circle cx="26.5" cy="27" r="4.6" />
          <circle cx="37.5" cy="27" r="4.6" />
          <line x1="31.1" y1="27" x2="32.9" y2="27" />
        </g>
      )}
    </svg>
  );
}
