#ifndef VALICORE_H
#define VALICORE_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Thread-affine handles. protocol=1. See docs/ABI.md for JSON operations. */
uint8_t *valicore_alloc(uint32_t length);
void valicore_dealloc(uint8_t *pointer, uint32_t length);
uint8_t *valicore_invoke(const uint8_t *input, uint32_t length, uint32_t *output_length);
#ifdef __cplusplus
}
#endif
#endif
