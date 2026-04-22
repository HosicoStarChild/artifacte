export const submissionCategories = [
  "TCG Cards",
  "Sports Cards",
  "Watches",
  "Spirits",
  "Digital Art",
  "Sealed Product",
  "Merchandise",
] as const;

export const submissionStatuses = [
  "pending",
  "approved",
  "rejected",
  "minted",
  "delivered",
] as const;

export const MAX_SUBMISSION_PHOTOS = 5;
export const MAX_SUBMISSION_NAME_LENGTH = 120;
export const MAX_SUBMISSION_DESCRIPTION_LENGTH = 2000;
export const MAX_SUBMISSION_CONTACT_LENGTH = 160;
export const MAX_SUBMISSION_PHOTO_URL_LENGTH = 2048;

export type SubmissionCategory = (typeof submissionCategories)[number];
export type SubmissionStatus = (typeof submissionStatuses)[number];

export type SubmissionMetadataValue =
  | string
  | number
  | boolean
  | null
  | SubmissionMetadataObject
  | SubmissionMetadataValue[];

export interface SubmissionMetadataObject {
  [key: string]: SubmissionMetadataValue;
}

export interface SubmissionFormData {
  name: string;
  category: SubmissionCategory;
  description: string;
  photos: string[];
  contact: string;
}

export interface SubmissionCreateRequest extends SubmissionFormData {
  sellerWallet?: string | null;
}

export interface Submission {
  id: string;
  name: string;
  category: SubmissionCategory;
  description: string;
  photos: string[];
  sellerWallet: string | null;
  contact: string;
  status: SubmissionStatus;
  adminNotes?: string;
  submittedAt: number;
  reviewedAt?: number;
  nftName?: string;
  nftSymbol?: string;
  nftImageUri?: string;
  nftMetadata?: SubmissionMetadataObject;
  mintedAt?: number;
}

export const defaultSubmissionCategory: SubmissionCategory = "Digital Art";

export function createEmptySubmissionPhotoFields(): string[] {
  return Array.from({ length: MAX_SUBMISSION_PHOTOS }, () => "");
}

export function createEmptySubmissionForm(): SubmissionFormData {
  return {
    name: "",
    category: defaultSubmissionCategory,
    description: "",
    photos: createEmptySubmissionPhotoFields(),
    contact: "",
  };
}

export function normalizeSubmissionText(value: string): string {
  return value.trim();
}

export function normalizeOptionalSellerWallet(value?: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhotoUrls(photos: readonly string[]): string[] {
  return photos
    .map((photo) => photo.trim())
    .filter((photo) => photo.length > 0);
}

export function isSubmissionCategory(value: string): value is SubmissionCategory {
  return submissionCategories.some((category) => category === value);
}

export function isSubmissionStatus(value: string): value is SubmissionStatus {
  return submissionStatuses.some((status) => status === value);
}

export function isSafeSubmissionPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSubmissionFields(fields: {
  name: string;
  category: string;
  description: string;
  photos: readonly string[];
  contact: string;
}): string | null {
  if (!fields.name) {
    return "Item name is required";
  }

  if (fields.name.length > MAX_SUBMISSION_NAME_LENGTH) {
    return `Item name must be ${MAX_SUBMISSION_NAME_LENGTH} characters or fewer`;
  }

  if (!isSubmissionCategory(fields.category)) {
    return "Please choose a valid category";
  }

  if (!fields.description) {
    return "Description is required";
  }

  if (fields.description.length > MAX_SUBMISSION_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_SUBMISSION_DESCRIPTION_LENGTH} characters or fewer`;
  }

  if (!fields.contact) {
    return "Contact info is required";
  }

  if (fields.contact.length > MAX_SUBMISSION_CONTACT_LENGTH) {
    return `Contact info must be ${MAX_SUBMISSION_CONTACT_LENGTH} characters or fewer`;
  }

  if (fields.photos.length === 0) {
    return "Please provide at least one photo URL";
  }

  if (fields.photos.length > MAX_SUBMISSION_PHOTOS) {
    return `Please provide no more than ${MAX_SUBMISSION_PHOTOS} photo URLs`;
  }

  const invalidPhoto = fields.photos.find(
    (photo) =>
      photo.length > MAX_SUBMISSION_PHOTO_URL_LENGTH || !isSafeSubmissionPhotoUrl(photo)
  );

  if (invalidPhoto) {
    return "Photo URLs must be valid http(s) links";
  }

  return null;
}
