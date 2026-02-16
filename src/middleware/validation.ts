import { body, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array().map(e => e.msg) });
    return;
  }
  next();
}

const validateRegistration = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 alphanumeric characters or underscores'),
  body('name').isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 characters)'),
  handleValidationErrors,
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  handleValidationErrors,
];

const validateProfileUpdate = [
  body('name').optional().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must be under 500 characters'),
  body('interests').optional().isArray().withMessage('Interests must be an array'),
  handleValidationErrors,
];

const validatePostCreation = [
  body('title').isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('content').isLength({ min: 10, max: 10000 }).withMessage('Content must be 10-10000 characters'),
  body('business_id').custom((val: string) => isValidUUID(val)).withMessage('Valid business_id required'),
  handleValidationErrors,
];

const validatePostUpdate = [
  body('title').optional().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('content').optional().isLength({ min: 10, max: 10000 }).withMessage('Content must be 10-10000 characters'),
  handleValidationErrors,
];

const validateMessageCreation = [
  body('content').isLength({ min: 1, max: 5000 }).withMessage('Content must be 1-5000 characters'),
  body('parent_message_id').optional({ values: 'null' }).custom((val: string) => !val || isValidUUID(val)).withMessage('Invalid parent_message_id'),
  handleValidationErrors,
];

const validateReviewCreation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().isLength({ max: 1000 }).withMessage('Comment must be under 1000 characters'),
  handleValidationErrors,
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  handleValidationErrors,
];

export {
  isValidUUID,
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePostCreation,
  validatePostUpdate,
  validateMessageCreation,
  validateReviewCreation,
  validatePagination,
};
