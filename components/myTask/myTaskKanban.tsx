"use client"

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
    CancelDrop,
    closestCenter,
    CollisionDetection,
    defaultDropAnimationSideEffects,
    DndContext,
    DragOverlay,
    DropAnimation,
    getFirstCollision,
    KeyboardCoordinateGetter,
    KeyboardSensor,
    MeasuringStrategy,
    Modifiers,
    MouseSensor,
    pointerWithin,
    rectIntersection,
    TouchSensor,
    UniqueIdentifier,
    useDroppable,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import {
    MixerHorizontalIcon,
} from "@radix-ui/react-icons";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {CSS} from '@dnd-kit/utilities';
import { CirclePlus } from "lucide-react";
import {useDispatch} from "react-redux";
import {coordinateGetter as multipleContainersCoordinateGetter} from "@/components/task/multipleContainersKeyboardCoordinates";
import {
    AnimateLayoutChanges,
    arrayMove,
    defaultAnimateLayoutChanges, horizontalListSortingStrategy,
    SortableContext,
    SortingStrategy, useSortable, verticalListSortingStrategy
} from "@dnd-kit/sortable";
import {createPortal, unstable_batchedUpdates} from "react-dom";
import {Container, ContainerProps, Item} from "@/components/kanbanComponents";
import {TaskKanbanColumnPriorityFilter} from "@/components/task/taskKanbanColumnPriorityFilter";
import {CreateTaskInterface, TaskInfoInterface} from "@/types/task";
import {useFetch} from "@/hooks/useFetch";
import {UserInfoRawInterface} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {GetTaskStatusQueryParamByStatus} from "@/lib/utils/getTaskStatusQueryParamByStatus";
import {TaskKanbanProjectFilter} from "@/components/task/taskKanbanProjectFilter";
import {openUI} from "@/store/slice/uiSlice";
import {taskStatuses} from "@/types/table";
import {usePost} from "@/hooks/usePost";
import {mutate} from "swr";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";
import {VList} from "virtua";

export const animateLayoutChanges: AnimateLayoutChanges = (args) =>
    defaultAnimateLayoutChanges({...args, wasDragging: true});

export function DroppableContainer({
                                children,
                                columns = 1,
                                disabled,
                                id,
                                items,
                                style,
                                ...props
                            }: ContainerProps & {
    disabled?: boolean;
    id: UniqueIdentifier;
    items: TaskInfoInterface[];
    style?: React.CSSProperties;
}) {
    const {
        active,
        attributes,
        isDragging,
        listeners,
        over,
        setNodeRef,
        transition,
        transform,
    } = useSortable({
        id,
        data: {
            type: 'container',
            children: items,
        },
        animateLayoutChanges,
    });
    const isOverContainer = over
        ? (id === over.id && active?.data.current?.type !== 'container') ||
        (items.find(t => t.task_uuid === over.id) && true)
        : false;

    return (
        <Container
            ref={disabled ? undefined : setNodeRef}
            style={{
                ...style,
                transition,
                transform: CSS.Translate.toString(transform),
                opacity: isDragging ? 0.5 : undefined,
            }}
            hover={isOverContainer}
            handleProps={{
                ...attributes,
                ...listeners,
            }}
            columns={columns}
            {...props}
        >
            {children}
        </Container>
    );
}

export const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
            },
        },
    }),
};

export type Items = Record<UniqueIdentifier, TaskInfoInterface[]>;

export interface KanbanProps {
    adjustScale?: boolean;
    projectId?:string
    cancelDrop?: CancelDrop;
    columns?: number;
    containerStyle?: React.CSSProperties;
    coordinateGetter?: KeyboardCoordinateGetter;
    getItemStyles?(args: {
        value: UniqueIdentifier;
        index: number;
        overIndex: number;
        isDragging: boolean;
        containerId: UniqueIdentifier;
        isSorting: boolean;
        isDragOverlay: boolean;
    }): React.CSSProperties;
    wrapperStyle?(args: {index: number}): React.CSSProperties;
    itemCount?: number;
    items?: Items;
    handle?: boolean;
    strategy?: SortingStrategy;
    modifiers?: Modifiers;
    minimal?: boolean;
    trashable?: boolean;
    scrollable?: boolean;
    vertical?: boolean;
}

export const TRASH_ID = 'void';
export const PLACEHOLDER_ID = 'placeholder';


export const MyTaskKanban = ({
                                 adjustScale = false,
                                 cancelDrop,
                                 columns,
                                 handle = false,
                                 containerStyle,
                                 coordinateGetter = multipleContainersCoordinateGetter,
                                 getItemStyles = () => ({}),
                                 wrapperStyle = () => ({}),
                                 minimal = false,
                                 modifiers,
                                 strategy = verticalListSortingStrategy,
                                 trashable = false,
                                 vertical = false,
                                 scrollable = true,
                             }: KanbanProps) => {
    const dispatch = useDispatch();
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();
    const post = usePost();

    const [activeProject, setActiveProject] = useState<string[]>([])
    const [viewableStatus, setViewableStatus] = useState<Record<string, boolean>>({
        backlog: false,
        todo: true,
        inProgress: true,
        inReview: false,
        done: true,
        canceled: false
    });

    const [containers, setContainers] = useState([] as UniqueIdentifier[]);

    useEffect(() => {
        setContainers(Object.keys(viewableStatus).filter(key => viewableStatus[key]) as UniqueIdentifier[]);
    }, [viewableStatus]);


    const [priorityFilter, setPriorityFilter] = useState<string[]>([]);

    const urlParam = GetTaskStatusQueryParamByStatus({projectFilter:activeProject});

    const userInfo = useFetch<UserInfoRawInterface>( urlParam? GetEndpointUrl.GetUserTaskListForKanban+'?'+urlParam : GetEndpointUrl.GetUserTaskListForKanban);

    // // backlogTask
    // const taskBacklogInfo = taskService.getUserAssignedTaskList(queryStringBacklog);
    //
    // // todoTask
    // const queryStringTodo = GetTaskStatusQueryParamByStatus({getAll:true, status:'todo', priorityFilter, projectFilter:activeProject});
    // const taskTodoInfo = taskService.getUserAssignedTaskList(queryStringTodo);
    //
    // // inProgressTask
    // const queryStringInProgress = GetTaskStatusQueryParamByStatus({getAll:true, status:'inProgress', priorityFilter, projectFilter:activeProject});
    // const taskInProgressInfo = taskService.getUserAssignedTaskList(queryStringInProgress);
    //
    // // done
    // const queryStringDone = GetTaskStatusQueryParamByStatus({getAll:true, status:'done', priorityFilter, projectFilter:activeProject});
    // const taskDoneInfo = taskService.getUserAssignedTaskList(queryStringDone);
    //
    // // canceled
    // const queryStringCanceled = GetTaskStatusQueryParamByStatus({getAll:true, status:'canceled', priorityFilter, projectFilter:activeProject});
    // const taskCanceledInfo = taskService.getUserAssignedTaskList(queryStringCanceled);

    const [items, setItems] = useState<Items>(
        () =>
            ({
                backlog: [] as TaskInfoInterface[],
                todo:  [] as TaskInfoInterface[],
                inProgress:  [] as TaskInfoInterface[],
                inReview: [] as TaskInfoInterface[],
                done: [] as TaskInfoInterface[],
                canceled: [] as TaskInfoInterface[],
            })
    );

    const [activeId, setActiveId] = useState<UniqueIdentifier |  null>(null);
    const [activeTask, setActiveTask] = useState<TaskInfoInterface |  null>(null);

    const lastOverId = useRef<UniqueIdentifier| null>(null);
    const recentlyMovedToNewContainer = useRef(false);
    const isSortingContainer =
        activeId != null ? viewableStatus[activeId] : false;

    const collisionDetectionStrategy: CollisionDetection = useCallback(
        (args) => {
            if (activeId && viewableStatus[activeId]) {
                return closestCenter({
                    ...args,
                    droppableContainers: args.droppableContainers.filter(
                        (container) => viewableStatus[container.id]
                    ),
                });
            }

            // Start by finding any intersecting droppable
            const pointerIntersections = pointerWithin(args);
            const intersections =
                pointerIntersections.length > 0
                    ? // If there are droppables intersecting with the pointer, return those
                    pointerIntersections
                    : rectIntersection(args);
            let overId = getFirstCollision(intersections, 'id');

            if (overId != null) {
                if (overId === TRASH_ID) {
                    // If the intersecting droppable is the trash, return early
                    // Remove this if you're not using trashable functionality in your app
                    return intersections;
                }

                if (viewableStatus[overId]) {
                    const containerItems = items[overId];

                    // If a container is matched and it contains items (columns 'A', 'B', 'C')
                    if (containerItems.length > 0) {
                        // Return the closest droppable within that container
                        overId = closestCenter({
                            ...args,
                            droppableContainers: args.droppableContainers.filter(
                                (container) =>
                                    container.id !== overId &&
                                    containerItems.find((t) => t.task_uuid === container.id)
                            ),
                        })[0]?.id;
                    }
                }

                lastOverId.current = overId;

                return [{id: overId}];
            }

            // When a draggable item moves to a new container, the layout may shift
            // and the `overId` may become `null`. We manually set the cached `lastOverId`
            // to the id of the draggable item that was moved to the new container, otherwise
            // the previous `overId` will be returned which can cause items to incorrectly shift positions
            if (recentlyMovedToNewContainer.current) {
                lastOverId.current = activeId;
            }

            // If no droppable is matched, return the last match
            return lastOverId.current ? [{id: lastOverId.current}] : [];
        },
        [activeId, items]
    );

    const [clonedItems, setClonedItems] = useState<Items | null>(null);
    const sensors = useSensors(
        // Require a small drag distance before initiating drag, so a plain
        // click on the card surface (no movement) reaches the card's onClick
        // and opens the task panel. Without this, dnd-kit treats every
        // pointerdown as the start of a drag and swallows the click.
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            // Touch needs a short hold before drag to keep the tap-to-open
            // affordance working on mobile, while still allowing reordering.
            activationConstraint: { delay: 180, tolerance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter,
        })
    );
    const findContainer = (id: UniqueIdentifier) => {
        if (id in items) {
            return id;
        }

        return Object.keys(items).find((key) => items[key].find((t)=>t.task_uuid === id));
    };


    const getIndex = (id: UniqueIdentifier) => {
        const container = findContainer(id);

        if (!container) {
            return -1;
        }

        const index = items[container].findIndex(t => t.task_uuid == id);

        return index;
    };

    const onDragCancel = () => {
        if (clonedItems) {
            // Reset items to their original state in case items have been
            // Dragged across containers
            setItems(clonedItems);
        }

        setActiveId(null);
        setClonedItems(null);
    };

    useEffect(() => {
        requestAnimationFrame(() => {
            recentlyMovedToNewContainer.current = false;
        });
    }, [items]);



    useEffect(() => {
        if (activeId !== null) return;

        if (!userInfo.isLoading) {
            setItems(() => ({
                backlog: userInfo.data?.data.user_tasks_backlog || ([] as TaskInfoInterface[]),
                todo: userInfo.data?.data.user_tasks_todo || ([] as TaskInfoInterface[]),
                inProgress: userInfo.data?.data.user_tasks_in_progress || ([] as TaskInfoInterface[]),
                done: userInfo.data?.data.user_tasks_done || ([] as TaskInfoInterface[]),
                canceled: userInfo.data?.data.user_tasks_canceled || ([] as TaskInfoInterface[]),
                inReview: userInfo.data?.data.user_tasks_in_review || ([] as TaskInfoInterface[]),
            }));

            setClonedItems(null);
        }
    }, [userInfo.isLoading, userInfo.data?.data, activeId]);


    function renderSortableItemDragOverlay(id: UniqueIdentifier) {

        return (
            <Item
                task={activeTask||{} as TaskInfoInterface}
                value={id}
                handle={handle}
                style={getItemStyles({
                    containerId: findContainer(id) as UniqueIdentifier,
                    overIndex: -1,
                    index: getIndex(id),
                    value: id,
                    isSorting: true,
                    isDragging: true,
                    isDragOverlay: true,
                })}
                color={getColor(activeTask?.task_priority || '')}
                wrapperStyle={wrapperStyle({index: 0})}
                dragOverlay
            />
        );
    }

    function renderContainerDragOverlay(containerId: UniqueIdentifier) {
        return (
            <Container
                label={containerId as string}
                columns={columns}
                style={{
                    height: '100%',
                }}
                shadow
                unstyled={false}
            >
                {items[containerId].map((item, index) => (
                    <Item
                        key={item.task_uuid}
                        value={item.task_uuid}
                        handle={handle}
                        style={getItemStyles({
                            containerId,
                            overIndex: -1,
                            index: getIndex(item.task_uuid),
                            value: item.task_uuid,
                            isDragging: false,
                            isSorting: false,
                            isDragOverlay: false,
                        })}
                        color={getColor(item.task_priority)}
                        wrapperStyle={wrapperStyle({index})}
                        task={item}
                    />
                ))}
            </Container>
        );
    }

    // function handleRemove(containerID: UniqueIdentifier) {
    //     setContainers((containers) =>
    //         containers.filter((id) => id !== containerID)
    //     );
    // }
    //
    // function handleAddColumn() {
    //     const newContainerId = getNextContainerId();
    //
    //     unstable_batchedUpdates(() => {
    //         setContainers((containers) => [...containers, newContainerId]);
    //         setItems((items) => ({
    //             ...items,
    //             [newContainerId]: [],
    //         }));
    //     });
    // }

    function getNextContainerId() {
        const containerIds = Object.keys(items);
        const lastContainerId = containerIds[containerIds.length - 1];

        return String.fromCharCode(lastContainerId.charCodeAt(0) + 1);
    }

    const updateTaskStatus = async (taskStatus: string, taskId: string, taskProjectUUID: string, newIndex?: number) => {
        optimisticUpdateTask({ task_uuid: taskId, task_status: taskStatus }, taskProjectUUID, newIndex);

        post.makeRequest<CreateTaskInterface>({
            apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
            payload: {
                task_status: taskStatus,
                task_uuid: taskId,
                task_project_uuid: taskProjectUUID,
            }
        }).catch(()=>{
            revalidateTaskKeys(taskProjectUUID);
        })

    }

    async function handleDragEnd(taskInfo: TaskInfoInterface, newStatus: string, newIndex?: number) {

        if(!taskInfo.task_project.project_is_admin) return


        await updateTaskStatus(newStatus, taskInfo.task_uuid, taskInfo.task_project.project_uuid, newIndex)
    }



    return (
        <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className='flex  mb-4 justify-between'>
                <div className='flex space-x-2'>
                    <TaskKanbanProjectFilter activeList={activeProject} updateList={setActiveProject}/>
                    <TaskKanbanColumnPriorityFilter activeList={priorityFilter} updateList={setPriorityFilter}/>
                </div>



                <div className='flex space-x-2'>
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto hidden h-8 lg:flex"
                        onClick={()=>{dispatch(openUI({ key: 'createTask' }))}}
                    >
                        <CirclePlus className='h-4 w-4'/>{" "}{('createTask')}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto hidden h-8 lg:flex"
                            >
                                <MixerHorizontalIcon className="mr-2 h-4 w-4" />
                                {('view')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[150px]">
                            <DropdownMenuLabel>{('toggleColumns')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {taskStatuses.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.value}
                                    className="capitalize"
                                    checked={viewableStatus[column.value as keyof typeof viewableStatus]}
                                    onCheckedChange={(value) =>
                                        setViewableStatus((prev) => ({
                                            ...prev,
                                            [column.value]: value
                                        }))
                                    }
                                >
                                    {column.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

            </div>


            <div className="flex-1 overflow-hidden mt-2">
                <div className="flex h-full gap-4 pb-4 overflow-x-auto">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={collisionDetectionStrategy}
                        measuring={{
                            droppable: {
                                strategy: MeasuringStrategy.Always,
                            },
                        }}
                        onDragStart={({active}) => {
                            const t = active.data.current?.task as TaskInfoInterface
                            if(t && t.task_project.project_is_admin!== undefined && !(t.task_project.project_is_admin)) return

                            setActiveTask(active.data.current?.task as TaskInfoInterface);

                            setActiveId(active.id);
                            setClonedItems(items);
                        }}
                        onDragOver={({active, over}) => {
                            const overId = over?.id;
                            const t = active.data.current?.task as TaskInfoInterface
                            if(t && t.task_project.project_is_admin!== undefined && !(t.task_project.project_is_admin)) return

                            if (overId == null || overId === TRASH_ID || active.id in items) {
                                return;
                            }

                            setItems((prev) => {
                                const activeContainer = Object.keys(prev).find((key) => prev[key].find((t)=>t.task_uuid === active.id));
                                const overContainer = (overId in prev) ? overId : Object.keys(prev).find((key) => prev[key].find((t)=>t.task_uuid === overId));

                                if (!activeContainer || !overContainer) {
                                    return prev;
                                }

                                if (activeContainer !== overContainer) {
                                    const activeItems = prev[activeContainer];
                                    const overItems = prev[overContainer];
                                    const overIndex = overItems.findIndex(t => t.task_uuid === overId);
                                    const activeIndex = activeItems.findIndex(t => t.task_uuid === active.id);

                                    if (activeIndex === -1) return prev;

                                    let newIndex: number;

                                    if (overId in prev) {
                                        newIndex = overItems.length;
                                    } else {
                                        const isBelowOverItem =
                                            over &&
                                            active.rect.current.translated &&
                                            active.rect.current.translated.top >
                                            over.rect.top + over.rect.height;

                                        const modifier = isBelowOverItem ? 1 : 0;

                                        newIndex =
                                            overIndex >= 0 ? overIndex + modifier : overItems.length;
                                    }

                                    recentlyMovedToNewContainer.current = true;

                                    const itemToMove = activeItems[activeIndex];

                                    return {
                                        ...prev,
                                        [activeContainer]: activeItems.filter(
                                            (item) => item.task_uuid !== active.id
                                        ),
                                        [overContainer]: [
                                            ...overItems.slice(0, newIndex),
                                            itemToMove,
                                            ...overItems.slice(newIndex, overItems.length),
                                        ],
                                    };
                                } else {
                                    // Intra-container sorting in onDragOver for immediate feedback
                                    const containerItems = prev[overContainer];
                                    const activeIndex = containerItems.findIndex(t => t.task_uuid === active.id);
                                    const overIndex = containerItems.findIndex(t => t.task_uuid === overId);

                                    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
                                        return {
                                            ...prev,
                                            [overContainer]: arrayMove(containerItems, activeIndex, overIndex),
                                        };
                                    }
                                    return prev;
                                }
                            });
                        }}
                        onDragEnd={async ({active, over}) => {
                            const overId = over?.id;

                            if (overId == null) {
                                setActiveId(null);
                                setActiveTask(null);
                                return;
                            }

                            if (active.id in items && overId !== active.id) {
                                setContainers((containers) => {
                                    const activeIndex = containers.indexOf(active.id);
                                    const overIndex = containers.indexOf(overId);

                                    return arrayMove(containers, activeIndex, overIndex);
                                });
                            }

                            const overContainer = findContainer(overId);
                            
                            // Get final index from the current items state (updated by onDragOver)
                            const finalIndex = overContainer ? items[overContainer].findIndex(t => t.task_uuid === active.id) : undefined;

                            // Original container where drag started
                            const originalContainer = clonedItems 
                                ? Object.keys(clonedItems).find(key => 
                                    clonedItems[key].some(t => t.task_uuid === active.id)
                                  )
                                : null;
                            
                            try {
                                if(active.data.current?.task && overContainer && originalContainer) {
                                    if (overContainer !== originalContainer) {
                                        await handleDragEnd(active.data.current?.task, overContainer as string, finalIndex);
                                    } else if (finalIndex !== -1 && finalIndex !== undefined) {
                                        // Intra-column reordering
                                        optimisticUpdateTask({ task_uuid: active.id as string }, active.data.current?.task.task_project.project_uuid, finalIndex);
                                    }
                                }
                            } finally {
                                // Finalize state updates in next tick
                                setTimeout(() => {
                                    unstable_batchedUpdates(() => {
                                        setActiveId(null);
                                        setActiveTask(null);
                                        setClonedItems(null);
                                    });
                                }, 0);
                            }
                        }}
                        cancelDrop={cancelDrop}
                        onDragCancel={onDragCancel}
                        modifiers={modifiers}
                    >
                        <div
                            className="flex h-full gap-4 pb-4"

                        >
                            <SortableContext
                                items={[...containers, PLACEHOLDER_ID]}
                                strategy={
                                    vertical
                                        ? verticalListSortingStrategy
                                        : horizontalListSortingStrategy
                                }
                            >
                                {containers.map((containerId) => (
                                    <DroppableContainer
                                        key={containerId}
                                        id={containerId}
                                        label={containerId as string}
                                        columns={columns}
                                        items={items[containerId]}
                                        scrollable={scrollable}
                                        style={containerStyle}
                                        unstyled={minimal}
                                        // onRemove={() => handleRemove(containerId)}
                                    >
                                        <SortableContext items={items[containerId].map(t => t.task_uuid)} strategy={strategy}>
                                            <div className="flex flex-col gap-2 w-full pb-4">
                                            {items[containerId].map((value, index) => {
                                                return (
                                                    <SortableItem
                                                        disabled={isSortingContainer}
                                                        key={value.task_uuid}
                                                        id={value.task_uuid}
                                                        index={index}
                                                        handle={handle}
                                                        style={getItemStyles}
                                                        wrapperStyle={wrapperStyle}
                                                        containerId={containerId}
                                                        getIndex={getIndex}
                                                        task={value}
                                                    />
                                                );
                                            })}
                                            </div>
                                        </SortableContext>
                                    </DroppableContainer>
                                ))}
                                {/*{minimal ? undefined : (*/}
                                {/*    <DroppableContainer*/}
                                {/*        id={PLACEHOLDER_ID}*/}
                                {/*        disabled={isSortingContainer}*/}
                                {/*        items={empty}*/}
                                {/*        // onClick={handleAddColumn}*/}
                                {/*        placeholder*/}
                                {/*    >*/}
                                {/*        + Add column*/}
                                {/*    </DroppableContainer>*/}
                                {/*)}*/}
                            </SortableContext>
                        </div>
                        {createPortal(
                            <DragOverlay adjustScale={adjustScale} dropAnimation={dropAnimation}>
                                {activeId
                                    ? containers.includes(activeId)
                                        ? renderContainerDragOverlay(activeId)
                                        : renderSortableItemDragOverlay(activeId)
                                    : null}
                            </DragOverlay>,
                            document.body
                        )}
                        {trashable && activeId && !containers.includes(activeId) ? (
                            <Trash id={TRASH_ID} />
                        ) : null}
                    </DndContext>
                </div>
            </div>
        </div>
    );
};

function getColor(id: UniqueIdentifier) {
    switch (id) {
        case 'high':
            return '#f43f5e';
        case 'medium':
            return '#FFC107';
        case 'low':
            return '#0EA5E9';

    }

    return '#FFC107';
}

function Trash({id}: {id: UniqueIdentifier}) {
    const {setNodeRef, isOver} = useDroppable({
        id,
    });

    return (
        <div
            ref={setNodeRef}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'fixed',
                left: '50%',
                marginLeft: -150,
                bottom: 20,
                width: 300,
                height: 60,
                borderRadius: 5,
                border: '1px solid',
                borderColor: isOver ? 'red' : '#DDD',
            }}
        >
            Drop here to delete
        </div>
    );
}

type Args = {
    value: UniqueIdentifier;
    index: number;
    overIndex: number;
    isDragging: boolean;
    containerId: UniqueIdentifier;
    isSorting: boolean;
    isDragOverlay: boolean;
};
export interface SortableItemProps {
    containerId: UniqueIdentifier;
    id: UniqueIdentifier;
    task: TaskInfoInterface
    index: number;
    handle: boolean;
    disabled?: boolean;
    style<T extends Args>(args: T): React.CSSProperties;
    getIndex(id: UniqueIdentifier): number;
    renderItem?(): React.ReactElement;
    wrapperStyle({index}: {index: number}): React.CSSProperties;
}

export function SortableItem({
                          disabled,
                          id,
                          index,
                          handle,
                          renderItem,
                          style,
                          containerId,
                          getIndex,
                            task,
                          wrapperStyle,
                      }: SortableItemProps) {
    const {
        setNodeRef,
        setActivatorNodeRef,
        listeners,
        isDragging,
        isSorting,
        over,
        overIndex,
        transform,
        transition,
    } = useSortable({
        id,
        data: {
            type: 'task',
            task: task,
            index,
            containerId
        }
    });
    const mounted = useMountStatus();
    const mountedWhileDragging = isDragging && !mounted;

    return (
        <Item
            ref={disabled ? undefined : setNodeRef}
            value={id}
            dragging={isDragging}
            sorting={isSorting}
            handle={handle}
            handleProps={handle ? {ref: setActivatorNodeRef} : undefined}
            index={index}
            wrapperStyle={wrapperStyle({index})}
            style={style({
                index,
                value: id,
                isDragging,
                isSorting,
                overIndex: over ? getIndex(over.id) : overIndex,
                containerId,
                isDragOverlay: false,
            })}
            color={getColor(task.task_priority)}
            transition={transition}
            transform={transform}
            fadeIn={mountedWhileDragging}
            listeners={listeners}
            renderItem={renderItem}
            task={task}
        />
    );
}

function useMountStatus() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setIsMounted(true), 500);

        return () => clearTimeout(timeout);
    }, []);

    return isMounted;
}
