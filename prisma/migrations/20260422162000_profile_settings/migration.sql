-- Add profile settings fields for user settings page
ALTER TABLE "User"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "profileImageUrl" TEXT,
ADD COLUMN "profileImageSize" INTEGER,
ADD COLUMN "profileImageMimeType" TEXT;