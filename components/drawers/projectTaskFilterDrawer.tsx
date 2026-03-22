"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { taskPriorityOptions, taskStatusOptions } from "@/types/task"
import {useFetch} from "@/hooks/useFetch";
import {ProjectInfoRawInterface} from "@/types/project";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {updateProjectSortingAndFiltering} from "@/store/slice/taskFilterSlice";
import {DesktopNavigationChatAvatar} from "@/components/navigationBar/desktop/desktopNavigationChatAvatar";
import {useEffect} from "react";
import type { RootState } from "@/store/store"

// Define sort field enum
const sortFieldEnum = z.enum(["task_start_date", "task_due_date", "task_created_date"])

// Define the schema using Zod
const filterSchema = z.object({
    sort: z.object({
        id: sortFieldEnum,
        desc: z.boolean(),
    }),
    priority: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    assignee: z.array(z.string()).optional(),
})

type FilterFormValues = z.infer<typeof filterSchema>

interface ProjectTaskFilterDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    projectId: string

}

export function ProjectTaskFilterDrawer({ drawerOpenState, setOpenState, projectId }: ProjectTaskFilterDrawerProps) {
    const [activeTab, setActiveTab] = React.useState("sort")
    const projectInfo = useFetch<ProjectInfoRawInterface>(projectId ? GetEndpointUrl.GetProjectMemberInfo + '/' + projectId : '')
    const dispatch = useDispatch()
    const taskFiltersAndSorts = useSelector((state: RootState) => state.taskFilter.projectsSortingAndFilter[projectId])

    useEffect(() => {
        if (drawerOpenState) {
            const filters = taskFiltersAndSorts?.filters || []
            const priority = filters.find((f: any) => f.id === "task_priority")?.value || []
            const status = filters.find((f: any) => f.id === "task_status")?.value || []
            const assignee = filters.find((f: any) => f.id === "task_assignee_name")?.value || []
            
            const sortArr = taskFiltersAndSorts?.sort || []
            const sort = sortArr.length > 0 ? sortArr[0] : { id: "task_start_date", desc: false }

            reset({
                sort: sort as FilterFormValues["sort"],
                priority,
                status,
                assignee,
            })
        }
    }, [drawerOpenState, taskFiltersAndSorts])

    const {
        control,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
        reset,
    } = useForm<FilterFormValues>({
        resolver: zodResolver(filterSchema),
        defaultValues: {
            sort: { id: "task_start_date", desc: false },
            priority: [],
            status: [],
        },
    })

    useEffect(()=>{
        setActiveTab("sort")
    },[projectId])

    const filterCategories = [
        { id: "sort", label: "Sort" },
        { id: "priority", label: "Priority" },
        { id: "status", label: "Status" },
        { id: "assignee", label: "Assignee" },
    ]

    const sortOptions = [
        { id: "task_start_date", desc: false, label: "Start: Low to High" },
        { id: "task_start_date", desc: true, label: "Start: High to Low" },
        { id: "task_due_date", desc: false, label: "Due: Low to High" },
        { id: "task_due_date", desc: true, label: "Due: High to Low" },
        { id: "task_created_date", desc: false, label: "Created: Low to High" },
        { id: "task_created_date", desc: true, label: "Created: High to Low" },
    ]



    const onSubmit = (data: FilterFormValues) => {
        // Transform filters into the desired array format
        const filters = [
            ...(data.priority?.length ? [{ id: "task_priority", value: data.priority }] : []),
            ...(data.status?.length ? [{ id: "task_status", value: data.status }] : []),
            ...(data.assignee?.length ? [{ id: "task_assignee_name", value: data.assignee }] : []),
        ]


        dispatch(updateProjectSortingAndFiltering({projectId, filters, sort: Array(data.sort)}))

        setOpenState(false)
    }

    const closeDrawer = () => {
        setOpenState(false)
    }

    const handleClear = () => {
        reset({
            sort: { id: "task_start_date", desc: false },
            priority: [],
            status: [],
            assignee: [],
        })
        dispatch(updateProjectSortingAndFiltering({ projectId, filters: [], sort: [] }))
        setOpenState(false)
    }

    const renderTabContent = () => {
        if (activeTab === "sort") {
            // Helper to stringify the sort object for RadioGroup value
            const currentSortValue = JSON.stringify(watch("sort"))

            return (
                <RadioGroup
                    value={currentSortValue}
                    onValueChange={(value) => {
                            const parsedSort = JSON.parse(value)
                            setValue("sort", parsedSort as FilterFormValues["sort"])

                    }}
                    className="space-y-4"
                >
                    {sortOptions.map((option) => {
                        const optionValue = JSON.stringify({ id: option.id, desc: option.desc })
                        return (
                            <div key={optionValue} className="flex items-center space-x-3">
                                <RadioGroupItem
                                    value={optionValue}
                                    id={optionValue}
                                    className="border-gray-600"
                                />
                                <Label className="font-normal" htmlFor={optionValue}>
                                    {option.label}
                                </Label>
                            </div>
                        )
                    })}
                </RadioGroup>
            )
        }

        const fieldName = activeTab as "priority" | "status" | "assignee"

        if (activeTab === "assignee") {
            return (
                <div className="space-y-4">
                    {projectInfo.data?.data.project_members.map((option) => {


                        return (<div key={option.uid} className="flex items-center space-x-3">
                            <Checkbox
                                id={`${activeTab}-${option.uid}`}
                                checked={watch(fieldName)?.includes(option.uid || "")}
                                onCheckedChange={(checked) => {
                                    const currentValues = watch(fieldName) || []
                                    const newValues = checked
                                        ? [...currentValues, option.uid || ""]
                                        : currentValues.filter((val) => val !== (option.uid || ""))
                                    setValue(fieldName, newValues)
                                }}
                                value={option.uid}
                                className="h-5 w-5 border-gray-600"
                            />
                            <Label className="font-normal flex gap-x-1 justify-center items-center" htmlFor={`${activeTab}-${option.uid}`}>
                                <DesktopNavigationChatAvatar userInfo={option}/>
                                {option.user_name}
                            </Label>
                        </div>)
                    })}
                </div>)
        }


        const optionsMap = {
            priority: taskPriorityOptions,
            status: taskStatusOptions,
        }

        const currentOptions = optionsMap[activeTab as keyof typeof optionsMap] || []

        return (
            <div className="space-y-4">
                {currentOptions.map((option) => {

                    return (<div key={option.id} className="flex items-center space-x-3">
                        <Checkbox
                            id={`${activeTab}-${option.id}`}
                            checked={watch(fieldName)?.includes(option.id)}
                            onCheckedChange={(checked) => {
                                const currentValues = watch(fieldName) || []
                                const newValues = checked
                                    ? [...currentValues, option.id]
                                    : currentValues.filter((val) => val !== option.id)
                                setValue(fieldName, newValues)
                            }}
                            value={option.id}
                            className="h-5 w-5 border-gray-600"
                        />
                        <Label className="font-normal" htmlFor={`${activeTab}-${option.id}`}>
                            {option.label}
                        </Label>
                    </div>)
                })}
            </div>
        )
    }

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <form onSubmit={handleSubmit(onSubmit)} className="w-full">
                    <DrawerHeader className="text-left">
                        <DrawerTitle>Sort and filter</DrawerTitle>
                        <DrawerDescription></DrawerDescription>
                    </DrawerHeader>
                    <div className="h-full">
                        <div className="grid grid-cols-9 border-t border-b h-[40vh]">
                            {/* Vertical Tabs */}
                            <div className="border-r col-span-3">
                                {filterCategories.map((category) => (
                                    <div
                                        key={category.id}
                                        className={`p-4 border-b flex justify-between items-center cursor-pointer ${
                                            activeTab === category.id ? "bg-secondary" : ""
                                        }`}
                                        onClick={() => setActiveTab(category.id)}
                                    >
                                        <span>{category.label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="p-6 col-span-6 overflow-y-auto h-full">
                                {renderTabContent()}
                                {errors[activeTab as keyof FilterFormValues] && (
                                    <p className="text-red-500 text-sm mt-2">
                                        {errors[activeTab as keyof FilterFormValues]?.message}
                                    </p>
                                )}
                            </div>
                        </div>
                        <DrawerFooter className="flex flex-row space-x-2 w-full">
                            <Button type="button" variant="outline" className="flex-1" onClick={handleClear}>Clear Filters</Button>
                            <Button type="submit" className="flex-1">Apply</Button>
                        </DrawerFooter>
                    </div>
                </form>
            </DrawerContent>
        </Drawer>
    )
}