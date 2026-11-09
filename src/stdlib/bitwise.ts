import type { GlobalContext } from '../runtime/context';
import { toNumber } from '../runtime/values';

/** Приведение к 32-битному беззнаковому числу (uint). */
const u32 = (n: number): number => n >>> 0;

/** Глобальные поразрядные операции (uint32), см. GlobalBitFunctions.cs. */
export function registerBitFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ПобитовоеИ', 'BitAnd', (args) => u32(u32(toNumber(args[0]!)) & u32(toNumber(args[1]!))));
  ctx.registerAlias('ПобитовоеИли', 'BitOr', (args) => u32(u32(toNumber(args[0]!)) | u32(toNumber(args[1]!))));
  ctx.registerAlias('ПобитовоеНе', 'BitNot', (args) => u32(~u32(toNumber(args[0]!))));
  ctx.registerAlias('ПобитовоеИНе', 'BitAndNot', (args) => u32(u32(toNumber(args[0]!)) & ~u32(toNumber(args[1]!))));
  ctx.registerAlias('ПобитовоеИсключительноеИли', 'BitXor', (args) =>
    u32(u32(toNumber(args[0]!)) ^ u32(toNumber(args[1]!))),
  );
  ctx.registerAlias('ПобитовыйСдвигВлево', 'BitShiftLeft', (args) =>
    u32(u32(toNumber(args[0]!)) << toNumber(args[1]!)),
  );
  ctx.registerAlias('ПобитовыйСдвигВправо', 'BitShiftRight', (args) =>
    u32(u32(toNumber(args[0]!)) >>> toNumber(args[1]!)),
  );
  ctx.registerAlias('ПроверитьБит', 'CheckBit', (args) =>
    (u32(toNumber(args[0]!)) >>> toNumber(args[1]!)) % 2 === 1,
  );
  ctx.registerAlias('УстановитьБит', 'SetBit', (args) => {
    const value = u32(toNumber(args[0]!));
    const bit = toNumber(args[1]!);
    const bitValue = toNumber(args[2]!);
    return bitValue === 1 ? u32(value | (1 << bit)) : u32(value & ~(1 << bit));
  });
  ctx.registerAlias('ПроверитьПоБитовойМаске', 'CheckByBitMask', (args) =>
    (u32(toNumber(args[0]!)) & u32(toNumber(args[1]!))) === u32(toNumber(args[1]!)),
  );
}
