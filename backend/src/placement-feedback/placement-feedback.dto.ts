import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PLACEMENT_FEEDBACK_BASED_ON,
  PLACEMENT_FEEDBACK_BOOK_AGAIN,
  PLACEMENT_FEEDBACK_RATINGS,
} from './placement-feedback.constants.js';

export class SubmitPlacementFeedbackDto {
  @IsIn(PLACEMENT_FEEDBACK_RATINGS)
  professionalism!: (typeof PLACEMENT_FEEDBACK_RATINGS)[number];

  @IsIn(PLACEMENT_FEEDBACK_RATINGS)
  communication!: (typeof PLACEMENT_FEEDBACK_RATINGS)[number];

  @IsIn(PLACEMENT_FEEDBACK_RATINGS)
  reliability!: (typeof PLACEMENT_FEEDBACK_RATINGS)[number];

  @IsIn(PLACEMENT_FEEDBACK_RATINGS)
  documentation!: (typeof PLACEMENT_FEEDBACK_RATINGS)[number];

  @IsIn(PLACEMENT_FEEDBACK_BOOK_AGAIN)
  bookAgain!: (typeof PLACEMENT_FEEDBACK_BOOK_AGAIN)[number];

  @IsIn(PLACEMENT_FEEDBACK_BASED_ON)
  basedOn!: (typeof PLACEMENT_FEEDBACK_BASED_ON)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;
}
