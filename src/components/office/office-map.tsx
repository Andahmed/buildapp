"use client";

import { EmployeeAvatar } from "./avatar";
import { Employee, DEPT_LABELS, DEPT_COLORS } from "./types";
import { FREE_DESKS, Dept } from "@/lib/employees";

const ROOMS: { x: number; y: number; w: number; h: number; label: string; tint?: string }[] = [
  { x: 2, y: 3, w: 15, h: 17, label: "مكتبي الرئيس", tint: "#fef3c7" },
  { x: 2, y: 22, w: 28, h: 33, label: DEPT_LABELS.management },
  { x: 2, y: 57, w: 28, h: 40, label: DEPT_LABELS.finance, tint: "#f0fdfa" },
  { x: 32, y: 3, w: 28, h: 23, label: DEPT_LABELS.hr, tint: "#fff1f2" },
  { x: 32, y: 28, w: 28, h: 69, label: DEPT_LABELS.tech, tint: "#ecfdf5" },
  { x: 60, y: 3, w: 38, h: 35, label: "التصميم والتسويق", tint: "#faf5ff" },
  { x: 60, y: 40, w: 38, h: 35, label: "قاعة الاجتماعات", tint: "#ecfdf5" },
  { x: 60, y: 77, w: 38, h: 20, label: "الاستراحة", tint: "#fef2f2" },
];

const MEETING_SEATS: [number, number][] = [
  [72, 47], [80, 45], [88, 47],
  [72, 68], [80, 70], [88, 68],
];

interface OfficeMapProps {
  employees: Employee[];
  meetingParticipantIds: string[];
  typingIds: string[];
  hasPendingTaskIds: Set<string>;
  onOpenChat: (id: string) => void;
  onOpenHire: () => void;
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <rect x="10" y="20" width="10" height="8" rx="2" fill="#c2653b" />
        <circle cx="15" cy="14" r="7" fill="#3fae6a" />
        <circle cx="10" cy="17" r="5" fill="#2f9155" />
        <circle cx="20" cy="17" r="5" fill="#54c17e" />
      </svg>
    </div>
  );
}

function Sofa({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <svg width="72" height="34" viewBox="0 0 72 34">
        <rect x="2" y="4" width="68" height="26" rx="8" fill="#e06b6b" />
        <rect x="8" y="10" width="25" height="14" rx="5" fill="#ee8f8f" />
        <rect x="39" y="10" width="25" height="14" rx="5" fill="#ee8f8f" />
        <rect x="2" y="24" width="68" height="8" rx="4" fill="#c45151" />
      </svg>
    </div>
  );
}

function Coffee({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <svg width="26" height="34" viewBox="0 0 26 34">
        <rect x="3" y="2" width="20" height="30" rx="3" fill="#57534e" />
        <rect x="7" y="8" width="12" height="9" rx="2" fill="#292524" />
        <circle cx="13" cy="24" r="2.5" fill="#e7e5e4" />
      </svg>
    </div>
  );
}

function ServerRack({ x, y }: { x: number; y: number }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <svg width="30" height="42" viewBox="0 0 30 42">
        <rect x="2" y="2" width="26" height="38" rx="3" fill="#334155" />
        {[9, 16, 23, 30].map((yy, i) => (
          <g key={i}>
            <rect x="6" y={yy - 3} width="18" height="5" rx="1.5" fill="#475569" />
            <circle cx="9.5" cy={yy - 0.5} r="1.2" fill={i % 2 ? "#4ade80" : "#facc15"} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function MeetingTable() {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "80%", top: "57.5%" }}>
      <svg width="220" height="130" viewBox="0 0 220 130">
        <ellipse cx="110" cy="65" rx="100" ry="55" fill="#d9c5a4" stroke="#b99e74" strokeWidth="3" />
        <ellipse cx="110" cy="65" rx="78" ry="40" fill="#e7d7bd" />
        <rect x="86" y="55" width="48" height="20" rx="4" fill="#57534e" opacity="0.85" />
        <text x="110" y="69" textAnchor="middle" fontSize="9" fill="#f5f5f4" fontWeight="bold">MEETING</text>
      </svg>
    </div>
  );
}

export function OfficeMap({
  employees,
  meetingParticipantIds,
  typingIds,
  hasPendingTaskIds,
  onOpenChat,
  onOpenHire,
}: OfficeMapProps) {
  const meetingSet = new Set(meetingParticipantIds);
  const takenSeats = new Set<string>();
  const takenDesks = new Set(employees.map((e) => `${e.x},${e.y}`));
  const seatIndex = { i: 0 };

  return (
    <div className="floor relative w-full overflow-hidden rounded-2xl border border-stone-200 shadow-sm" style={{ aspectRatio: "1.18", direction: "ltr" }}>
      {/* الغرف */}
      {ROOMS.map((room) => (
        <div
          key={room.label}
          className="room absolute flex items-start justify-start p-1.5"
          style={{
            left: `${room.x}%`,
            top: `${room.y}%`,
            width: `${room.w}%`,
            height: `${room.h}%`,
            backgroundColor: room.tint ? `${room.tint}cc` : undefined,
          }}
        >
          <span className="rounded-full bg-stone-800/80 px-2 py-0.5 text-[10px] font-bold text-white md:text-[11px]">
            {room.label}
          </span>
        </div>
      ))}

      {/* مكتب الرئيس */}
      <button
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-default"
        style={{ left: "9.5%", top: "12%" }}
        title="مكتبك — انت الرئيس التنفيذي"
      >
        <div className="flex flex-col items-center">
          <div className="desk flex h-9 w-14 items-center justify-center md:h-11 md:w-20">
            <span className="text-[9px] font-extrabold text-stone-700 md:text-[10px]">CEO</span>
          </div>
          <span className="mt-0.5 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-800 md:text-[10px]">
            أنت (الرئيس التنفيذي)
          </span>
        </div>
      </button>

      {/* ديكور */}
      <Sofa x={80} y={86} />
      <Coffee x={68} y={86} />
      <Plant x={94} y={86} />
      <Plant x={60.5} y={45} />
      <ServerRack x={53} y={75} />
      <MeetingTable />

      {/* الموظفين */}
      {employees.map((emp) => {
        let x = emp.x;
        let y = emp.y;
        let inMeeting = false;
        if (meetingSet.has(emp.id)) {
          const seat = MEETING_SEATS[Math.min(seatIndex.i++, MEETING_SEATS.length - 1)];
          if (!takenSeats.has(seat.join(","))) {
            takenSeats.add(seat.join(","));
            x = seat[0];
            y = seat[1];
          }
          inMeeting = true;
        }
        const typing = typingIds.includes(emp.id);
        const deptColor = DEPT_COLORS[emp.dept] ?? "#78716c";
        return (
          <button
            key={emp.id}
            onClick={() => onOpenChat(emp.id)}
            className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-transform hover:z-20 hover:scale-110 ${inMeeting ? "employee-meeting" : "employee-idle"}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={`${emp.name} — ${emp.role}`}
          >
            <div className="flex flex-col items-center">
              <div className="relative rounded-full border-2 bg-white/90 p-0.5 shadow-md" style={{ borderColor: deptColor }}>
                <EmployeeAvatar
                  skin={emp.skin}
                  hair={emp.hair}
                  shirt={emp.shirt}
                  gender={emp.gender}
                  size={40}
                />
                {typing && (
                  <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-stone-800 px-1.5 py-1">
                    <span className="typing-dot inline-block h-1 w-1 rounded-full bg-white" />
                    <span className="typing-dot inline-block h-1 w-1 rounded-full bg-white" />
                    <span className="typing-dot inline-block h-1 w-1 rounded-full bg-white" />
                  </span>
                )}
                {!typing && hasPendingTaskIds.has(emp.id) && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-500" title="عنده شغل بانتظار موافقتك" />
                )}
                {inMeeting && (
                  <span className="absolute -left-1 -top-1 text-[11px]" title="في ميتنج">🗣</span>
                )}
              </div>
              <span
                className="mt-0.5 max-w-[90px] truncate rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-stone-700 shadow-sm md:text-[10px]"
                style={{ boxShadow: `inset 0 0 0 1.5px ${deptColor}44` }}
              >
                {emp.name}
              </span>
            </div>
          </button>
        );
      })}

      {/* المكاتب الفاضية — توظيف */}
      {(Object.entries(FREE_DESKS) as [Dept, { x: number; y: number }[]][]).flatMap(([dept, desks]) =>
        desks
          .filter((d) => !takenDesks.has(`${d.x},${d.y}`))
          .slice(0, 2)
          .map((d) => (
            <button
              key={`${dept}-${d.x}-${d.y}`}
              onClick={onOpenHire}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 opacity-80 transition hover:scale-110 hover:opacity-100"
              style={{ left: `${d.x}%`, top: `${d.y}%` }}
              title={`مكتب فاضي في ${DEPT_LABELS[dept]} — اضغط توظف حد`}
            >
              <div className="flex h-6 w-12 items-center justify-center rounded border-2 border-dashed border-stone-400 bg-white/50 md:h-8 md:w-16">
                <span className="text-[9px] font-bold text-stone-500 md:text-[10px]">+ وظّف</span>
              </div>
            </button>
          ))
      )}
    </div>
  );
}
