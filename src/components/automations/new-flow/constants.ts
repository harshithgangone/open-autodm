export const AUTOMATION_TYPES = [
    {
        id: "comment-dm",
        name: "Comment to DM",
        description: "Auto-DM people who comment on your posts or reels.",
        iconType: "message",
        available: true,
        bg: "from-[#F97316]/20 to-[#fc9c54]/10",
        border: "group-hover:border-[#F97316]/50",
        iconColor: "text-[#F97316]"
    },
    {
        id: "dm-reply",
        name: "DM Auto Reply",
        description: "Instantly reply to specific keywords in your DMs.",
        iconType: "send",
        available: true,
        bg: "from-blue-500/20 to-indigo-500/10",
        border: "group-hover:border-blue-500/50",
        iconColor: "text-blue-500"
    },
    {
        id: "story-reply",
        name: "Story Reply",
        description: "Send an automated response when someone replies to your story.",
        iconType: "image",
        available: true,
        bg: "from-green-500/20 to-emerald-500/10",
        border: "group-hover:border-green-500/50",
        iconColor: "text-green-500"
    },
    {
        id: "story-mention",
        name: "Story Mention",
        description: "Reward followers who mention you in their own stories.",
        iconType: "at-sign",
        available: false,
        bg: "from-muted/20 to-muted/10",
        border: "border-border/50",
        iconColor: "text-muted-foreground"
    }
];
