interface IconProps {
  name: string
  size?: number
  className?: string
  alt?: string
}

export default function Icon({ name, size = 24, className = '', alt = '' }: IconProps) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return (
    <img
      src={`${base}/icon_${name}.svg`}
      width={size}
      height={size}
      className={className}
      alt={alt}
      aria-hidden={!alt || undefined}
      draggable={false}
    />
  )
}
