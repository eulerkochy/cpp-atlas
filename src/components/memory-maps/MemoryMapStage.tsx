"use client";

import { MemoryMapKind } from "@/types/cpp";
import { ContainerInvalidationMap } from "./ContainerInvalidationMap";
import { CoroutineFrameMap } from "./CoroutineFrameMap";
import { Cpp26PreviewMap } from "./Cpp26PreviewMap";
import { MemoryModelMap } from "./MemoryModelMap";
import { MoveForwardingMap } from "./MoveForwardingMap";
import { ObjectLifetimeMap } from "./ObjectLifetimeMap";
import { OverloadLookupMap } from "./OverloadLookupMap";
import { SmartPointerMap } from "./SmartPointerMap";
import { TemplatesConceptsMap } from "./TemplatesConceptsMap";
import { ValueCategoryMap } from "./ValueCategoryMap";
import { VtableLayoutMap } from "./VtableLayoutMap";

export function MemoryMapStage({ kind }: { kind: MemoryMapKind }) {
  switch (kind) {
    case "value-categories":
      return <ValueCategoryMap />;
    case "memory-model":
      return <MemoryModelMap />;
    case "object-lifetime":
      return <ObjectLifetimeMap />;
    case "move-and-forwarding":
      return <MoveForwardingMap />;
    case "templates-and-concepts":
      return <TemplatesConceptsMap />;
    case "coroutine-frame":
      return <CoroutineFrameMap />;
    case "vtable-layout":
      return <VtableLayoutMap />;
    case "container-invalidation":
      return <ContainerInvalidationMap />;
    case "smart-pointers":
      return <SmartPointerMap />;
    case "overload-lookup":
      return <OverloadLookupMap />;
    case "cpp26-preview":
      return <Cpp26PreviewMap />;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
