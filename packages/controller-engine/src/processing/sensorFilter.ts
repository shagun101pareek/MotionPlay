export class LowPass {
  private value: number | null = null;

  constructor(private readonly alpha: number) {}

  push(sample: number): number {
    if (this.value === null || !Number.isFinite(this.value)) {
      this.value = sample;
      return sample;
    }
    this.value += this.alpha * (sample - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
