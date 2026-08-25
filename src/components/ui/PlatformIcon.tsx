export function PlatformIcon({ icon, size = 18, className }: { icon: string | null; size?: number; className?: string }) {
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
      {icon || "🌐"}
    </span>
  );
}
