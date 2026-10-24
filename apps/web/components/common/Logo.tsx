import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  href?: string;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  imageClassName = 'h-8 sm:h-9 w-auto object-contain',
  priority = true,
  href = '/',
}) => {
  const content = (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src="/logo.png"
        alt="Exprest"
        width={120}
        height={40}
        priority={priority}
        className={`${imageClassName} dark:hidden`}
      />
      <Image
        src="/logo-dark.png"
        alt="Exprest"
        width={120}
        height={40}
        priority={priority}
        className={`${imageClassName} hidden dark:block`}
      />
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center hover:opacity-95 transition-opacity">
      {content}
    </Link>
  );
};
