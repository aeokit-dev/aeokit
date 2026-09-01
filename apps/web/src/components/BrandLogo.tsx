const BRAND_ASSET_ROOT = "/brand/final-v1";

export function BrandLogo({
  className = "h-7",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      <img
        src={`${BRAND_ASSET_ROOT}/aeokit-logo.svg`}
        alt="aeokit"
        width="380"
        height="96"
        className="brand-logo-light block h-full w-auto"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      <img
        src={`${BRAND_ASSET_ROOT}/aeokit-logo-dark.svg`}
        alt=""
        aria-hidden="true"
        width="380"
        height="96"
        className="brand-logo-dark hidden h-full w-auto"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </span>
  );
}

export function BrandMark({
  className = "size-11",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src={`${BRAND_ASSET_ROOT}/aeokit-app-icon.svg`}
      alt={decorative ? "" : "aeokit"}
      width="128"
      height="128"
      className={`block shrink-0 ${className}`}
      aria-hidden={decorative || undefined}
    />
  );
}
