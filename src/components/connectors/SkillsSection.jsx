import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import TagInput from "./TagInput";

export default function SkillsSection({
  skillDirectories,
  disabledSkills,
  onChangeDirectories,
  onChangeDisabledSkills,
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-muted-foreground">
            psychology
          </span>
          Skill Configuration
        </h3>
      </div>

      {(!skillDirectories?.length && !disabledSkills?.length) && (
        <p className="text-center text-xs text-muted-foreground py-2">
          Skills load automatically from your project. Use these settings to add extra directories or disable specific skills.
        </p>
      )}

      {/* Skill Directories */}
      <div className="space-y-2">
        <Label htmlFor="skill-dirs">Skill Directories</Label>
        <TagInput
          id="skill-dirs"
          value={skillDirectories || []}
          onChange={onChangeDirectories}
          placeholder="/path/to/skills"
        />
        <p className="text-xs text-muted-foreground">
          Directories containing skill definitions. The SDK will load skills
          from these paths.
        </p>
      </div>

      <Separator className="my-4" />

      {/* Disabled Skills */}
      <div className="space-y-2">
        <Label htmlFor="disabled-skills">Disabled Skills</Label>
        <TagInput
          id="disabled-skills"
          value={disabledSkills || []}
          onChange={onChangeDisabledSkills}
          placeholder="skill-name"
        />
        <p className="text-xs text-muted-foreground">
          Skills to exclude even if present in skill directories.
        </p>
      </div>
    </div>
  );
}
