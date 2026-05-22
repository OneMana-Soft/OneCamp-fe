import { Users } from "@/lib/icons";
import { TeamInfoInterface } from "@/types/team";
import { ListRow } from "@/components/ui/listRow";
import { ColorIcon } from "@/components/colorIcon/colorIcon";

interface TeamsInfoInterface {
    teamInfo: TeamInfoInterface
}

/**
 * Single team row in the mobile teams list. Notion-style: brand-colour
 * avatar tile keyed off the team UUID, title with truncation, member
 * count as muted meta on the right. Click handling is owned by the
 * parent <Link>.
 */
export const TeamInfo = ({ teamInfo }: TeamsInfoInterface) => {
    const memberCount = teamInfo.team_member_count || 0
    const meta = `${memberCount} ${memberCount === 1 ? "member" : "members"}`

    return (
        <ListRow
            density="default"
            leading={<ColorIcon name={teamInfo.team_uuid} size="sm" />}
            title={<span className="capitalize">{teamInfo.team_name}</span>}
            meta={meta}
        />
    )
}
