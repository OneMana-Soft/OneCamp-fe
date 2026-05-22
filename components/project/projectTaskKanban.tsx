import {useCallback, useEffect, useRef, useState} from 'react';

import { VList } from "virtua"

import {
    closestCenter,
    CollisionDetection,
    DndContext,
     DragOverlay,  getFirstCollision, KeyboardSensor, MeasuringStrategy, MouseSensor,
    pointerWithin, rectIntersection, TouchSensor,
    UniqueIdentifier, useSensor, useSensors
} from '@dnd-kit/core';
import {
    CheckCircledIcon,
    CircleIcon, CrossCircledIcon,
    MixerHorizontalIcon, QuestionMarkCircledIcon, StopwatchIcon,
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

import { CircleEllipsis, CirclePlus } from "lucide-react";
import {useDispatch} from "react-redux";
import {
    dropAnimation, DroppableContainer,
    Items,
    KanbanProps, PLACEHOLDER_ID, SortableItem,
    TRASH_ID
} from "@/components/myTask/myTaskKanban";
import {Container, Item} from "@/components/kanbanComponents";
import {
    coordinateGetter as multipleContainersCoordinateGetter
} from "@/components/task/multipleContainersKeyboardCoordinates";
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import {createPortal, unstable_batchedUpdates} from "react-dom";
import {TaskKanbanColumnPriorityFilter} from "@/components/task/taskKanbanColumnPriorityFilter";
import {useFetch} from "@/hooks/useFetch";
import {ProjectInfoRawInterface} from "@/types/project";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {GetTaskStatusQueryParamByStatus} from "@/lib/utils/getTaskStatusQueryParamByStatus";
import {CreateTaskInterface, TaskInfoInterface} from "@/types/task";
import {openUI} from "@/store/slice/uiSlice";
import {prioritiesInterface, taskStatuses} from "@/types/table";
import {ProjectTaskKanbanAssigneeFilter} from "@/components/project/projectTaskKanbanAssigneeFilter";
import {usePost} from "@/hooks/usePost";
import {mutate} from "swr";
import {useTaskUpdate} from "@/hooks/useTaskUpdate";



export const ProjectTaskKanban = ({
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
                                        projectId=''
                                  }: KanbanProps) => {
    const dispatch = useDispatch();
    const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate();


    const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
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

    const urlParam = GetTaskStatusQueryParamByStatus({assigneeFilter:assigneeFilter, priorityFilter});

    const post = usePost()

    const projectInfo = useFetch<ProjectInfoRawInterface>(projectId? GetEndpointUrl.GetProjectTaskListForKanban+'/'+projectId+'?'+urlParam : '');

    const isAdmin = projectInfo.data?.data.project_is_admin !== undefined ? projectInfo.data?.data.project_is_admin : true;


    //
    // // backlogTask
    // const taskBacklogInfo = taskService.getProjectTaskList(projectId, queryStringBacklog);
    //
    // // todoTask
    // const queryStringTodo = GetTaskStatusQueryParamByStatus({getAll:true, status:'todo', priorityFilter, assigneeFilter:assigneeFilter});
    // const taskTodoInfo = taskService.getProjectTaskList(projectId, queryStringTodo);
    //
    // // inProgressTask
    // const queryStringInProgress = GetTaskStatusQueryParamByStatus({getAll:true, status:'inProgress', priorityFilter, assigneeFilter:assigneeFilter});
    // const taskInProgressInfo = taskService.getProjectTaskList(projectId, queryStringInProgress);
    //
    // // done
    // const queryStringDone = GetTaskStatusQueryParamByStatus({getAll:true, status:'done', priorityFilter, assigneeFilter:assigneeFilter});
    // const taskDoneInfo = taskService.getProjectTaskList(projectId, queryStringDone);
    //
    // // canceled
    // const queryStringCanceled = GetTaskStatusQueryParamByStatus({getAll:true, status:'canceled', priorityFilter, assigneeFilter:assigneeFilter});
    // const taskCanceledInfo = taskService.getProjectTaskList(projectId, queryStringCanceled);

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

        setItems(() => ({
            backlog: projectInfo.data?.data.project_tasks_backlog || ([] as TaskInfoInterface[]),
            todo: projectInfo.data?.data.project_tasks_todo || ([] as TaskInfoInterface[]),
            inProgress: projectInfo.data?.data.project_tasks_in_progress || ([] as TaskInfoInterface[]),
            done: projectInfo.data?.data.project_tasks_done || ([] as TaskInfoInterface[]),
            canceled: projectInfo.data?.data.project_tasks_canceled || ([] as TaskInfoInterface[]),
            inReview: projectInfo.data?.data.project_tasks_in_review || ([] as TaskInfoInterface[]),
        }));
    }, [projectInfo.data?.data, activeId]);



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


    const updateTaskStatus = async (taskStatus: string, taskId: string, newIndex?: number) => {
        optimisticUpdateTask({ task_uuid: taskId, task_status: taskStatus }, projectId, newIndex);

        post.makeRequest<CreateTaskInterface>({
            apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
            payload: {
                task_status: taskStatus,
                task_uuid: taskId,
                task_project_uuid: projectId,
            }
        }).catch(()=> {
            revalidateTaskKeys(projectId);
        })
    }

    async function handleDragEnd(taskInfo: TaskInfoInterface, newStatus: string, newIndex?: number) {

        if(!projectInfo.data?.data.project_is_admin) return


        await updateTaskStatus(newStatus, taskInfo.task_uuid, newIndex)
    }

    return (
        <div className="flex flex-col h-full p-4 overflow-hidden">
            <div className='flex  mb-4 justify-between'>
                <div className='flex space-x-2'>
                    <ProjectTaskKanbanAssigneeFilter activeList={assigneeFilter} updateList={setAssigneeFilter} members={projectInfo.data?.data.project_members}/>
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
                            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {taskStatuses.map((column:prioritiesInterface) => (
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
                            if(active.data.current?.task && !isAdmin) return
                            setActiveTask(active.data.current?.task as TaskInfoInterface);

                            setActiveId(active.id);
                            setClonedItems(items);
                        }}
                        onDragOver={({active, over}) => {
                            const overId = over?.id;

                            if(active.data.current?.task && !isAdmin) return

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
                                    // Intra-container sorting
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

                            if (overId == null || !isAdmin) {
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
                                        optimisticUpdateTask({ task_uuid: active.id as string }, projectId, finalIndex);
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
                            className="flex h-full gap-4"

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
                            <></>
                        ) : null}
                    </DndContext>
                </div>
            </div>
        </div>
    );
};