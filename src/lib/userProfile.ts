export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_MAX_LABEL = '5MB';
export const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_IMAGE_ACCEPT = ALLOWED_PROFILE_IMAGE_TYPES.join(',');

export type PublicUser = {
  id: string;
  email: string;
  fullName: string | null;
  profileImageUrl: string | null;
};

export function toPublicUser(user: {
  id: string;
  email: string;
  fullName?: string | null;
  profileImageUrl?: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName?.trim() || null,
    profileImageUrl: user.profileImageUrl || null
  };
}

function titleCaseWords(value: string) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function getUserDisplayName(user: Pick<PublicUser, 'email' | 'fullName'> | null | undefined) {
  const fullName = user?.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const localPart = user?.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (localPart) {
    return titleCaseWords(localPart);
  }

  return 'there';
}

export function getUserInitials(user: Pick<PublicUser, 'email' | 'fullName'> | null | undefined) {
  const fullName = user?.fullName?.trim();
  if (fullName) {
    const words = fullName.split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || 'U';
  }

  const localPart = user?.email?.trim()?.[0];
  return localPart ? localPart.toUpperCase() : 'U';
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}