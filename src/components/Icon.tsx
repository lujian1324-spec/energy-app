interface IconProps {
  name: string
  size?: number
  className?: string
  alt?: string
  /**
   * Tint the glyph. The handoff colours several icons (e.g. the bottom nav uses
   * `#B0F2EB` selected / `#018072` idle), and the shipped SVGs are hard-coded to
   * white — so a tinted icon is rendered as a CSS mask instead of an <img>.
   */
  color?: string
}

export default function Icon({ name, size = 24, className = '', alt = '', color }: IconProps) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const src = `${base}/icon_${name}.svg`

  if (color) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt || undefined}
        className={`inline-block ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    )
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt={alt}
      aria-hidden={!alt || undefined}
      draggable={false}
    />
  )
}
