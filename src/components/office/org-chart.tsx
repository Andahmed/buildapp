"use client";

import { EmployeeAvatar } from "./avatar";
import { Employee } from "./types";
import { ORG_PARENT, DEPT_LEAD, Dept } from "@/lib/employees";
import { Network } from "lucide-react";

interface OrgChartProps {
  employees: Employee[];
  onOpenChat: (id: string) => void;
}

interface OrgNode {
  emp: Employee;
  children: OrgNode[];
}

function buildTree(employees: Employee[]): OrgNode {
  const childrenOf = new Map<string | null, Employee[]>();
  for (const e of employees) {
    const parentName = ORG_PARENT[e.name] ?? DEPT_LEAD[e.dept as Dept] ?? "رامي";
    const key = e.name === "رامي" ? null : parentName;
    const list = childrenOf.get(key) ?? [];
    list.push(e);
    childrenOf.set(key, list);
  }
  // الجذر: رامي تحت الرئيس مباشرة، ولو حصل موظفين مش متوصليين ييجوا تحت رامي
  const root = childrenOf.get(null) ?? [];
  const rootNode: OrgNode = {
    emp: {
      id: "ceo",
      name: "أنت",
      role: "الرئيس التنفيذي",
      dept: "management",
      gender: "male",
      skin: "#eab892",
      hair: "#2f2a26",
      shirt: "#d97706",
      personality: "",
      skills: [],
      tools: [],
      x: 0,
      y: 0,
      createdAt: "",
    },
    children: root.map(build),
  };
  function build(emp: Employee): OrgNode {
    const kids = childrenOf.get(emp.name) ?? [];
    return { emp, children: kids.map(build) };
  }
  return rootNode;
}

function Node({ node, depth, onOpenChat }: { node: OrgNode; depth: number; onOpenChat: (id: string) => void }) {
  const isCEO = node.emp.id === "ceo";
  const hasChildren = node.children.length > 0;
  return (
    <div className="relative" style={{ paddingInlineStart: depth > 0 ? (isCEO ? 0 : 44) : 0 }}>
      {depth > 0 && <span className="org-connector absolute inset-y-0 start-[8px] block w-0" />}
      <div className={`flex flex-col gap-2 ${depth > 0 ? "pt-2" : ""}`}>
        <button
          onClick={() => !isCEO && onOpenChat(node.emp.id)}
          className={`flex w-fit items-center gap-2.5 rounded-2xl border-2 px-3 py-2 text-right shadow-sm transition ${
            isCEO ? "border-amber-400 bg-amber-50 cursor-default" : "border-stone-200 bg-white hover:border-emerald-400 hover:shadow-md"
          }`}
        >
          <span className="rounded-full border border-stone-200 bg-white">
            <EmployeeAvatar skin={node.emp.skin} hair={node.emp.hair} shirt={node.emp.shirt} gender={node.emp.gender} size={36} />
          </span>
          <span>
            <span className="block text-sm font-bold text-stone-800">{node.emp.name}</span>
            <span className="block text-[11px] text-stone-500">{node.emp.role}</span>
          </span>
        </button>
        {hasChildren && (
          <div className="flex flex-col gap-0">
            {node.children.map((c) => (
              <Node key={c.emp.id} node={c} depth={depth + 1} onOpenChat={onOpenChat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrgChart({ employees, onOpenChat }: OrgChartProps) {
  const tree = buildTree(employees);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <Network className="h-5 w-5 text-emerald-700" />
        <h3 className="font-bold text-stone-800">الهيكل التنظيمي للشركة</h3>
        <span className="text-xs text-stone-400">({employees.length} موظف AI)</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <Node node={tree} depth={0} onOpenChat={onOpenChat} />
      </div>
    </div>
  );
}
