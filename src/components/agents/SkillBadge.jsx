import { Badge } from "@/components/ui/badge";

export default function SkillBadge({ block }) {
  return (
    <Badge variant="outline" className="my-1 gap-1.5 border-violet-200 bg-violet-50/50 px-3 py-1 text-violet-700">
      <span className="material-symbols-outlined text-[14px]">bolt</span>
      {block.skillName}
    </Badge>
  );
}
