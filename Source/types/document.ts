import { PROCESSING_STATUS } from '../constants/document';

export type ProcessingStatus = (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];
