interface Props {
  height?: number;
  className?: string;
  inverted?: boolean;
}

export default function Logo({ height = 48, className = "", inverted = false }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Hlíðarkaup"
      style={{ height, width: "auto", filter: inverted ? "brightness(0) invert(1)" : "none" }}
      className={className}
    />
  );
}
