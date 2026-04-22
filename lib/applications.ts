export const applicationStatuses = ["pending", "approved", "rejected"] as const;
export const applicationReviewActions = ["approve", "reject"] as const;

export const MAX_APPLICATION_COLLECTION_NAME_LENGTH = 120;
export const MAX_APPLICATION_COLLECTION_ADDRESS_LENGTH = 120;
export const MAX_APPLICATION_CATEGORY_LENGTH = 80;
export const MAX_APPLICATION_DESCRIPTION_LENGTH = 500;
export const MAX_APPLICATION_PITCH_LENGTH = 300;
export const MAX_APPLICATION_SAMPLE_IMAGES = 3;
export const MAX_APPLICATION_URL_LENGTH = 2048;
export const MAX_APPLICATION_TWITTER_HANDLE_LENGTH = 50;

export type ApplicationStatus = (typeof applicationStatuses)[number];
export type ApplicationReviewAction = (typeof applicationReviewActions)[number];

export interface Application {
  id: string;
  walletAddress: string;
  collectionName: string;
  collectionAddress: string;
  category: string;
  description: string;
  pitch: string;
  sampleImages: string[];
  website?: string;
  twitter?: string;
  status: ApplicationStatus;
  submittedAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

export interface ApplicationsData {
  applications: Application[];
}

export interface CreateApplicationRequest {
  walletAddress?: string;
  collectionName?: string;
  collectionAddress?: string;
  category?: string;
  description?: string;
  pitch?: string;
  sampleImages?: string[];
  website?: string;
  twitter?: string;
}

export interface ReviewApplicationRequest {
  id?: string;
  action?: string;
  rejectionReason?: string;
}

export interface ApplicationsResponse {
  success: true;
  applications: Application[];
}

export interface ApplicationMutationResponse {
  success: true;
  application: Application;
}

export function normalizeApplicationText(value: string): string {
  return value.trim();
}

export function normalizeOptionalApplicationUrl(value?: string | null): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeApplicationSampleImages(sampleImages: readonly string[]): string[] {
  return sampleImages
    .map((sampleImage) => sampleImage.trim())
    .filter((sampleImage) => sampleImage.length > 0);
}

export function normalizeTwitterHandle(value?: string | null): string | undefined {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
    try {
      const url = new URL(normalized);
      const isSupportedHost = ["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(
        url.hostname.toLowerCase()
      );

      if (!isSupportedHost) {
        return undefined;
      }

      const [handle] = url.pathname.split("/").filter(Boolean);
      return handle ? handle.replace(/^@/, "") : undefined;
    } catch {
      return undefined;
    }
  }

  return normalized.replace(/^@/, "");
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.some((status) => status === value);
}

export function isApplicationReviewAction(value: string): value is ApplicationReviewAction {
  return applicationReviewActions.some((action) => action === value);
}

export function isSafeApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateApplicationFields(fields: {
  walletAddress: string;
  collectionName: string;
  collectionAddress: string;
  category: string;
  description: string;
  pitch: string;
  sampleImages: readonly string[];
  website?: string;
  twitter?: string;
}): string | null {
  if (!fields.walletAddress) {
    return "Wallet address is required";
  }

  if (!fields.collectionName) {
    return "Collection name is required";
  }

  if (fields.collectionName.length > MAX_APPLICATION_COLLECTION_NAME_LENGTH) {
    return `Collection name must be ${MAX_APPLICATION_COLLECTION_NAME_LENGTH} characters or fewer`;
  }

  if (!fields.collectionAddress) {
    return "Collection address is required";
  }

  if (fields.collectionAddress.length > MAX_APPLICATION_COLLECTION_ADDRESS_LENGTH) {
    return `Collection address must be ${MAX_APPLICATION_COLLECTION_ADDRESS_LENGTH} characters or fewer`;
  }

  if (!fields.category) {
    return "Category is required";
  }

  if (fields.category.length > MAX_APPLICATION_CATEGORY_LENGTH) {
    return `Category must be ${MAX_APPLICATION_CATEGORY_LENGTH} characters or fewer`;
  }

  if (!fields.description) {
    return "Description is required";
  }

  if (fields.description.length > MAX_APPLICATION_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_APPLICATION_DESCRIPTION_LENGTH} characters or fewer`;
  }

  if (!fields.pitch) {
    return "Pitch is required";
  }

  if (fields.pitch.length > MAX_APPLICATION_PITCH_LENGTH) {
    return `Pitch must be ${MAX_APPLICATION_PITCH_LENGTH} characters or fewer`;
  }

  if (fields.sampleImages.length > MAX_APPLICATION_SAMPLE_IMAGES) {
    return `Maximum ${MAX_APPLICATION_SAMPLE_IMAGES} sample images allowed`;
  }

  const invalidSampleImage = fields.sampleImages.find(
    (sampleImage) =>
      sampleImage.length > MAX_APPLICATION_URL_LENGTH || !isSafeApplicationUrl(sampleImage)
  );

  if (invalidSampleImage) {
    return "Sample images must use valid http(s) URLs";
  }

  if (fields.website) {
    if (fields.website.length > MAX_APPLICATION_URL_LENGTH || !isSafeApplicationUrl(fields.website)) {
      return "Website must use a valid http(s) URL";
    }
  }

  if (fields.twitter && fields.twitter.length > MAX_APPLICATION_TWITTER_HANDLE_LENGTH) {
    return `Twitter handle must be ${MAX_APPLICATION_TWITTER_HANDLE_LENGTH} characters or fewer`;
  }

  return null;
}

export function formatApplicationDate(timestamp?: number | null): string {
  if (!timestamp) {
    return "Not reviewed";
  }

  return new Date(timestamp).toLocaleDateString();
}

export function getApplicationPrimaryImage(application: Application): string | null {
  return application.sampleImages[0] ?? null;
}