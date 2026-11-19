"use client";

import { MemoryMapKind } from "@/types/cpp";
import { ContainerInvalidationMap } from "./ContainerInvalidationMap";
import { CoroutineFrameMap } from "./CoroutineFrameMap";
import { Cpp26PreviewMap } from "./Cpp26PreviewMap";
import { LambdaClosureMap } from "./LambdaClosureMap";
import { MemoryModelMap } from "./MemoryModelMap";
import { MoveForwardingMap } from "./MoveForwardingMap";
import { ObjectLifetimeMap } from "./ObjectLifetimeMap";
import { OverloadLookupMap } from "./OverloadLookupMap";
import { SmartPointerMap } from "./SmartPointerMap";
import { TemplatesConceptsMap } from "./TemplatesConceptsMap";
import { ValueCategoryMap } from "./ValueCategoryMap";
import { VtableLayoutMap } from "./VtableLayoutMap";

export function MemoryMapStage({
  kind,
  topicSlug,
}: {
  kind: MemoryMapKind;
  topicSlug?: string;
}) {
  switch (kind) {
    case "value-categories":
      return <ValueCategoryMap topicSlug={topicSlug} />;
    case "memory-model":
      return <MemoryModelMap topicSlug={topicSlug} />;
    case "object-lifetime":
      return <ObjectLifetimeMap topicSlug={topicSlug} />;
    case "move-and-forwarding":
      return <MoveForwardingMap topicSlug={topicSlug} />;
    case "templates-and-concepts":
      return <TemplatesConceptsMap topicSlug={topicSlug} />;
    case "coroutine-frame":
      return <CoroutineFrameMap topicSlug={topicSlug} />;
    case "vtable-layout":
      return <VtableLayoutMap topicSlug={topicSlug} />;
    case "container-invalidation":
      return <ContainerInvalidationMap topicSlug={topicSlug} />;
    case "smart-pointers":
      return <SmartPointerMap topicSlug={topicSlug} />;
    case "overload-lookup":
      return <OverloadLookupMap topicSlug={topicSlug} />;
    case "cpp26-preview":
      return <Cpp26PreviewMap topicSlug={topicSlug} />;
    case "lambda-closures":
      return <LambdaClosureMap topicSlug={topicSlug} />;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
