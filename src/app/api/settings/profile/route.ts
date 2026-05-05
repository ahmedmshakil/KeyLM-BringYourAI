import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { supportsUserProfileFields } from '@/lib/dbCompat';
import { errorResponse, jsonResponse } from '@/lib/http';
import { withApiMetrics } from '@/lib/metrics';
import {
  ALLOWED_PROFILE_IMAGE_TYPES,
  PROFILE_IMAGE_MAX_BYTES,
  toPublicUser
} from '@/lib/userProfile';
import { profileFullNameSchema } from '@/lib/validators';

export const runtime = 'nodejs';

const MIME_TO_EXTENSION: Record<(typeof ALLOWED_PROFILE_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function buildUploadsDirectory() {
  return path.join(process.cwd(), 'public', 'uploads', 'profiles');
}

function isManagedProfileImage(url: string | null | undefined) {
  return Boolean(url && url.startsWith('/uploads/profiles/'));
}

async function deleteManagedProfileImage(url: string | null | undefined) {
  if (!isManagedProfileImage(url)) {
    return;
  }

  const relativePath = url!.replace(/^\/+/, '');
  const filePath = path.join(process.cwd(), 'public', relativePath.replace(/^public\//, ''));

  try {
    await unlink(filePath);
  } catch {
    // Ignore cleanup failures for missing/locked files.
  }
}

async function saveProfileImage(userId: string, file: File) {
  const extension = MIME_TO_EXTENSION[file.type as keyof typeof MIME_TO_EXTENSION];
  const uploadsDirectory = buildUploadsDirectory();
  const fileName = `${userId}-${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = path.join(uploadsDirectory, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadsDirectory, { recursive: true });
  await writeFile(filePath, buffer);

  return {
    url: `/uploads/profiles/${fileName}`,
    mimeType: file.type,
    size: file.size
  };
}

export const GET = withApiMetrics('/api/settings/profile', 'GET', async () => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'You must be signed in to view settings.' }, 401);
  }

  return jsonResponse({ user: toPublicUser(user) });
});

export const POST = withApiMetrics('/api/settings/profile', 'POST', async (request: Request) => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'You must be signed in to update settings.' }, 401);
  }

  if (!(await supportsUserProfileFields())) {
    return errorResponse(
      {
        code: 'profile_schema_missing',
        message: 'Profile settings are unavailable until the latest database migration is applied.'
      },
      503
    );
  }

  try {
    const formData = await request.formData();
    const rawFullName = formData.get('fullName');
    const rawProfileImage = formData.get('profileImage');

    if (rawFullName !== null && typeof rawFullName !== 'string') {
      return errorResponse({ code: 'invalid_request', message: 'Invalid profile name.' }, 400);
    }

    if (rawProfileImage !== null && !(rawProfileImage instanceof File)) {
      return errorResponse({ code: 'invalid_request', message: 'Invalid profile image upload.' }, 400);
    }

    const parsedName = profileFullNameSchema.safeParse(rawFullName ?? '');
    if (!parsedName.success) {
      return errorResponse({ code: 'invalid_name', message: 'Full name must be 120 characters or less.' }, 400);
    }

    const fullName = parsedName.data.trim() ? parsedName.data.trim() : null;
    const profileImage = rawProfileImage instanceof File && rawProfileImage.size > 0 ? rawProfileImage : null;

    if (profileImage) {
      if (profileImage.size > PROFILE_IMAGE_MAX_BYTES) {
        return errorResponse(
          {
            code: 'image_too_large',
            message: 'Profile image must be 5MB or smaller.'
          },
          400
        );
      }

      if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(profileImage.type as (typeof ALLOWED_PROFILE_IMAGE_TYPES)[number])) {
        return errorResponse(
          {
            code: 'invalid_image_type',
            message: 'Upload a JPG, PNG, or WEBP image.'
          },
          400
        );
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      fullName
    };

    let uploadedImageUrl: string | null = null;

    try {
      if (profileImage) {
        const storedImage = await saveProfileImage(user.id, profileImage);
        uploadedImageUrl = storedImage.url;
        updateData.profileImageUrl = storedImage.url;
        updateData.profileImageMimeType = storedImage.mimeType;
        updateData.profileImageSize = storedImage.size;
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          profileImageUrl: true
        }
      });

      if (profileImage && user.profileImageUrl && user.profileImageUrl !== uploadedImageUrl) {
        await deleteManagedProfileImage(user.profileImageUrl);
      }

      return jsonResponse({ user: toPublicUser(updatedUser) });
    } catch (error) {
      if (uploadedImageUrl) {
        await deleteManagedProfileImage(uploadedImageUrl);
      }
      throw error;
    }
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Unable to save your profile settings.' }, 400);
  }
});
