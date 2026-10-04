/**
 * The oldest Node the template runs on, in one place for the two that check
 * it: the bin, before it loads anything else, and `run`. The package manifest
 * and the root manifest state it again in `engines`, and a test holds them to
 * this.
 *
 * WRITTEN FOR ANY NODE THAT CAN LOAD A MODULE AT ALL. The bin imports this
 * before it knows which Node it is on, so nothing here may be newer than the
 * bin itself: `export` and `var`.
 */
export var NODE_FLOOR = 22
