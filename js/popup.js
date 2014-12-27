/**
 * Code for the popup UI.
 */
p = {

  // Is this an external popup window? (vs. the one from the menu)
  is_external: false,

  // Options loaded when popup opened.
  options: null,

  // Info from page we were triggered from
  page_title: null,
  page_url: null,
  page_selection: null,
  favicon_url: null,

  // State to track so we only log events once.
  has_edited_name: false,
  has_edited_notes: false,
  has_reassigned: false,
  has_used_page_details: false,
  is_first_add: true,

  // Data from API cached for this popup
  workspaces: null,
  users: null,
  default_user: null,
  user_id: null,
  
  // Typeahead ui element
  typeahead: null,
  SILHOUETTE_URL: "./nopicture.png",

  // Task List
  tasksNumber: 0,
  tasksInboxNumber: 0,
  tasksTodayNumber: 0,
  tasksUpcomingNumber: 0,
  tasksLaterNumber: 0,

  tasksArray: [],
  tasksInboxArray: [],
  tasksTodayArray: [],
  tasksUpcomingArray:[],
  tasksLaterArray: [],
  failed: false,
  inAddTaskView: false,
  tasksCompleted: -1,

  taskIdComp: 0,


  onLoad: function() {
    var me = this;

    me.is_external = ('' + window.location.search).indexOf("external=true") !== -1;

    // Our default error handler.
    Asana.ServerModel.onError = function(response) {
      me.showError(response.errors[0].message);
    };

    // Ah, the joys of asynchronous programming.
    // To initialize, we've got to gather various bits of information.
    // Starting with a reference to the window and tab that were active when
    // the popup was opened ...
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      var tab = tabs[0];
      // Now load our options ...
      Asana.ServerModel.options(function(options) {
        me.options = options;
        // And ensure the user is logged in ...
        Asana.ServerModel.isLoggedIn(function(is_logged_in) {
          if (is_logged_in) {
            if (window.quick_add_request) {
              Asana.ServerModel.logEvent({
                name: "ChromeExtension-Open-QuickAdd"
              });
              // If this was a QuickAdd request (set by the code popping up
              // the window in Asana.ExtensionServer), then we have all the
              // info we need and should show the add UI right away.
              me.showTaskListUI();
              me.showAddUi(
                  quick_add_request.url, quick_add_request.title,
                  quick_add_request.selected_text,
                  quick_add_request.favicon_url);
            } else {
              Asana.ServerModel.logEvent({
                name: "ChromeExtension-Open-Button"
              });
              // Otherwise we want to get the selection from the tab that
              // was active when we were opened. So we set up a listener
              // to listen for the selection send event from the content
              // window ...
              var selection = "";
              var listener = function(request, sender, sendResponse) {
                if (request.type === "selection") {
                  chrome.runtime.onMessage.removeListener(listener);
                  console.info("Asana popup got selection");
                  selection = "\n" + request.value;
                }
              };
              chrome.runtime.onMessage.addListener(listener);
              me.showTaskListUi();
              me.showAddUi(tab.url, tab.title, '', tab.favIconUrl);
            }
          } else {
            // The user is not even logged in. Prompt them to do so!
            me.showLogin(
                Asana.Options.loginUrl(options),
                Asana.Options.signupUrl(options));
          }
        });
      });
    });

    // Wire up some events to DOM elements on the page.

    $(window).keydown(function(e) {
      // Close the popup if the ESCAPE key is pressed.
      if (e.which === 27) {
        if (me.is_first_add) {
          Asana.ServerModel.logEvent({
            name: "ChromeExtension-Abort"
          });
        }
        window.close();
      } else if (e.which === 9) {
        // Don't let ourselves TAB to focus the document body, so if we're
        // at the beginning or end of the tab ring, explicitly focus the
        // other end (setting body.tabindex = -1 does not prevent this)
        if (e.shiftKey && document.activeElement === me.firstInput().get(0)) {
          me.lastInput().focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === me.lastInput().get(0)) {
          me.firstInput().focus();
          e.preventDefault();
        }
      }
    });

    // Close if the X is clicked.
    // $(".close-x").click(function() {
    //   if (me.is_first_add) {
    //     Asana.ServerModel.logEvent({
    //       name: "ChromeExtension-Abort"
    //     });
    //   }
    //   window.close();
    // });

    $("#name_input").keyup(function() {
      if (!me.has_edited_name && $("#name_input").val() !== "") {
        me.has_edited_name = true;
        Asana.ServerModel.logEvent({
          name: "ChromeExtension-ChangedTaskName"
        });
      }
      me.maybeDisablePageDetailsButton();
    });
    $("#notes_input").keyup(function() {
      if (!me.has_edited_notes && $("#notes_input").val() !== "") {
        me.has_edited_notes= true;
        Asana.ServerModel.logEvent({
          name: "ChromeExtension-ChangedTaskNotes"
        });
      }
      me.maybeDisablePageDetailsButton();
    });

    // The page details button fills in fields with details from the page
    // in the current tab (cached when the popup opened).
    var use_page_details_button = $("#use_page_details");
    use_page_details_button.click(function() {
      if (!(use_page_details_button.hasClass('disabled'))) {
        // Page title -> task name
        $("#name_input").val(me.page_title);
        // Page url + selection -> task notes
        var notes = $("#notes_input");
        notes.val(notes.val() + me.page_url + "\n" + me.page_selection);
        // Disable the page details button once used.        
        use_page_details_button.addClass('disabled');
        if (!me.has_used_page_details) {
          me.has_used_page_details = true;
          Asana.ServerModel.logEvent({
            name: "ChromeExtension-UsedPageDetails"
          });
        }
      }
    });
  },

  maybeDisablePageDetailsButton: function() {
    if ($("#name_input").val() !== "" || $("#notes_input").val() !== "") {
      $("#use_page_details").addClass('disabled');
    } else {
      $("#use_page_details").removeClass('disabled');
    }
  },

  setExpandedUi: function(is_expanded) {
    if (this.is_external) {
      window.resizeTo(
          Asana.POPUP_UI_WIDTH,
          (is_expanded ? Asana.POPUP_EXPANDED_UI_HEIGHT : Asana.POPUP_UI_HEIGHT)
              + Asana.CHROME_TITLEBAR_HEIGHT);
    }
  },

  showView: function(name) {
    ["login", "add", "tasks"].forEach(function(view_name) {
      $("#" + view_name + "_view").css("display", view_name === name ? "" : "none");
    });
  },

  switchToAddView: function(){
    p.inAddTaskView = true;

    $('#add_view').animate({"margin-left": "0px"}, "fast");
    $('.add').animate({"right": "454px"}, "fast");
    $('.done').animate({"right": "489px"}, "fast");
    p.showView("add");
    
    $('#tasks_view').animate({"margin-left": "-450px"}, "fast");
    
  },

  showTaskListUi: function() {
    //p.loadCachedTasks();
    this.getRemainingTasks();
  },

  getRemainingTasks: function() {
    // Array containing all user's workspaces.
    var workspacesArray = [];
    // Array containing all user's projects.
    var projectsArray = [];
    
    Asana.ServerModel.me(function(user) {
      ga('set', '&uid', user.email); // Set the user ID using signed-in user_id.

      me = user;
      default_user = user;


      p.taskIdComp = 0;
      p.tasksNumber = 0;
      p.tasksInboxNumber = 0;
      p.tasksTodayNumber = 0;
      p.tasksUpcomingNumber = 0;
      p.tasksLaterNumber = 0;

        console.timeline("workspaces");
        console.time("workspaces");
        Asana.ServerModel.workspaces(function(workspaces) {
          console.timeEnd("workspaces");
        // Set the user's workspaces array.
        p.workspacesArray = workspaces;

        // If there are no workspaces, run out of here!
        if(p.workspacesArray == null || p.workspacesArray.length == 0){
          return;
        } 
    
        for(var i = 0;i<p.workspacesArray.length;i++){
          var workspaceID = p.workspacesArray[i].id;
          console.timeline("tasks "+i);
          console.time("tasks "+i);
          Asana.ServerModel.tasks(workspaceID,function(tasks) {
            console.timeEnd("tasks "+p.taskIdComp);
            p.taskIdComp += 1;
            if(p.taskIdComp == 1){
              p.tasksArray = [];
              p.tasksInboxArray = [];
              p.tasksTodayArray = [];
              p.tasksUpcomingArray = [];
              p.tasksLaterArray = [];
            }
            
            for (var i = 0; i < tasks.length; i++) {
              p.tasksArray.push(tasks[i]);
            };

            if(p.taskIdComp != p.workspacesArray.length){
              return;
            }
            

            var index = 1;
            p.tasksArray.forEach(function(task) {
              if(task.completed == false){
                
                if (task.assignee_status == "inbox"){
                  p.tasksInboxArray.push(task);
                } else if (task.assignee_status == "today") {
                  p.tasksTodayArray.push(task);
                } else if (task.assignee_status == "upcoming") {
                  p.tasksUpcomingArray.push(task);
                } else if (task.assignee_status == "later") {
                  p.tasksLaterArray.push(task);
                }
              } 
              if(p.tasksArray.length == index){
                
                p.tasksInboxNumber += p.showTasks(p.tasksInboxArray, "inboxList");
                
                p.tasksTodayNumber += p.showTasks(p.tasksTodayArray, "todayList");

                p.tasksUpcomingNumber += p.showTasks(p.tasksUpcomingArray, "upcomingList");
                
                p.tasksLaterNumber += p.showTasks(p.tasksLaterArray, "laterList");
                
                p.refreshTasksCounter();

                $(".loading").css("display", "none");
                
                if(!p.failed && p.tasksCompleted != -1){
                  if(p.tasksCompleted == 1){
                    p.showSuccess("You've marked one task as completed.");
                  }
                  else{
                    p.showSuccess("You've marked "+p.tasksCompleted+" tasks as completed.");
                  }
                }
                p.failed = false;
                p.tasksCompleted = -1;
                
                return;
              }
              index++;
            });// End of forEach task

            });// End of get tasks of a workspace
        }// End for
          });   
      });
  },

  loadCachedTasks: function() {
      if(localStorage.getItem("inboxList") ){
        p.tasksInboxNumber = p.showTasks(JSON.parse(localStorage.getItem("inboxList")), "inboxList" );
      }
      if(localStorage.getItem("todayList") ) {
        p.tasksTodayNumber = p.showTasks(JSON.parse(localStorage.getItem("todayList")), "todayList" );
      }
      if(localStorage.getItem("upcomingList") ) {
        p.tasksUpcomingNumber = p.showTasks(JSON.parse(localStorage.getItem("upcomingList")), "upcomingList" );
      }
      if(localStorage.getItem("laterList") ) {
        p.tasksLaterNumber = p.showTasks(JSON.parse(localStorage.getItem("laterList")), "laterList" );
      }
    
    },

  showTasks: function(tasksArray, listSelector) {

    p.tasksNumber += tasksArray.length;

    localStorage.setItem(listSelector, JSON.stringify(tasksArray));

    $("#"+listSelector).html("");
    for(var i = 0;i<tasksArray.length;i++){
      $("#"+listSelector).append("<tr class=\"taskLine\"><td width=\"45px\"> <input id=\""+tasksArray[i].id+"\" type=\"checkbox\"  class=\"regular-checkbox\" /> </td><td> <div class=\"truncate\"> <a href='"+p.createTaskUrl(tasksArray[i].id)+"' target='_blank'>"+tasksArray[i].name+"</a></div></td></tr><tr class=\"emptyLine\"></tr> ");
    }

    // Show the table tasks if !inAddTaskView
    if(!p.inAddTaskView){
      p.showView("tasks");
    }
    return tasksArray.length;
  },
  
    
  refreshTasksCounter: function() {
    $("#inboxCount").html( $("#inboxList").find("tr.taskLine").length );
    $("#todayCount").html( $("#todayList").find("tr.taskLine").length );
    $("#upcomingCount").html( $("#upcomingList").find("tr.taskLine").length );
    $("#laterCount").html( $("#laterList").find("tr.taskLine").length );  

    $("#tasksNumberInfo").html("");
    if(p.tasksNumber == 1){
      $("#tasksNumberInfo").append("You've one incomplete task.");  
    }
    else{
      $("#tasksNumberInfo").append("You've "+p.tasksNumber+" incomplete tasks."); 
    }
    
    // Refresh badge
    chrome.browserAction.setBadgeText({ text: p.tasksNumber+"" } );
  },

  showAddUi: function(url, title, selected_text, favicon_url) {
    var me = this;

    // Store off info from page we got triggered from.
    me.page_url = url;
    me.page_title = title;
    me.page_selection = selected_text;
    me.favicon_url = favicon_url;

    // Populate workspace selector and select default.
    Asana.ServerModel.me(function(user) {
      ga('set', '&uid', user.email); // Set the user ID using signed-in user_id.
      me.user_id = user.id;
      Asana.ServerModel.workspaces(function(workspaces) {
        me.workspaces = workspaces;
        var select = $("#workspace_select");
        select.html("");
        workspaces.forEach(function(workspace) {
          $("#workspace_select").append(
              "<option value='" + workspace.id + "'>" + workspace.name + "</option>");
        });
        if (workspaces.length > 1) {
          $("workspace_select_container").show();
        } else {
          $("workspace_select_container").hide();
        }
        select.val(me.options.default_workspace_id);
        me.onWorkspaceChanged();
        select.change(function() {
          if (select.val() !== me.options.default_workspace_id) {
            Asana.ServerModel.logEvent({
              name: "ChromeExtension-ChangedWorkspace"
            });
          }
          me.onWorkspaceChanged();
        });

        // Set initial UI state
        me.resetFields();
        me.showView("tasks");
        var name_input = $("#name_input");
        name_input.focus();
        name_input.select();

        if (favicon_url) {
          $(".icon-use-link").css("background-image", "url(" + favicon_url + ")");
        } else {
          $(".icon-use-link").addClass("no-favicon sprite");
        }
      });
    });

  },

  /**
   * @param enabled {Boolean} True iff the add button should be clickable.
   */
  setAddEnabled: function(enabled) {
    var me = this;
    var button = $("#add_button");
    if (enabled) {
      // Update appearance and add handlers.
      button.removeClass("disabled");
      button.addClass("enabled");
      button.click(function() {
        me.createTask();
        return false;
      });
      $('#name_input, #add_button').keydown(function(e) {
        if (e.keyCode === 13 && p.inAddTaskView) {
          me.createTask();

        }
      });
    } else {
      // Update appearance and remove handlers.
      button.removeClass("enabled");
      button.addClass("disabled");
      button.unbind('click');
      button.unbind('keydown');
    }
  },

  showError: function(message) {
    console.log("Error: " + message);
    $("#error").css("display", "inline-block");
    $("#errorMessage").html(message === null ? "Sorry, an error occurred. Please try again later.":message);
    
    $('#error').animate({"opacity": "1"}, "fast");
    setTimeout(function(){p.hideMessage("error")}, 4000);
  },

  showSuccess: function(message) {
    $("#success").css("display", "");
    $("#successMessage").html(message === null ? "Done!":message);
    $('#success').animate({"opacity": "1"}, "fast");
    setTimeout(function(){p.hideMessage("success")}, 4000);
  },

  showInfo: function(message) {
    $("#info").css("display", "");
    $("#infoMessage").html(message === null ? "Done!":message);
    $('#info').animate({"opacity": "1"}, "fast");
    setTimeout(function(){p.hideMessage("info")}, 4000);
  },

  hideMessage: function(selector) {
    $('#'+selector).animate({"opacity": "0"}, "fast", function(){
      $("#"+selector).css("display", "none");
    });
  },

  /**
   * Clear inputs for new task entry.
   */
  resetFields: function() {
    $("#name_input").val("");
    $("#notes_input").val("");
    $("#assignee_input").val("");
    $("#project_input").val("");
  },

  /**
   * Set the add button as being "working", waiting for the Asana request
   * to complete.
   */
  setAddWorking: function(working) {
    this.setAddEnabled(!working);
    $("#add_button").find(".button-text").text(
        working ? "Adding..." : "Add to Asana");
  },

  /**
   * Creates a typeahead.js object with a bloodhound engine that is attached
   * to the assignee input.
   */
  createUserTypeahead: function() {
    var me = this;
    // Instantiate the Bloodhound suggestion engine
    var selectana = new Bloodhound({
      datumTokenizer: function (datum) {
        return Bloodhound.tokenizers.whitespace(datum.value);
      },
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      remote: {
        url: Asana.ApiBridge.baseApiUrl() + '/workspaces/'
          + me.selectedWorkspaceId()
          + '/typeahead?type=user&query=%QUERY&opt_fields=name,photo.image_21x21',
        ajax : {
          beforeSend: function(jqXhr, settings){
            // WARNING: This will be deprecated, please see api_bridge.js
            jqXhr.setRequestHeader('X-Allow-Asana-Client', '1');
          }
        },
        filter: function (results) {
          return $.map(results.data, function (result) {
            console.log(result);
            return {
              value: result.name,
              id: result.id,
              photo_url: result.photo ? result.photo.image_21x21 : me.SILHOUETTE_URL

            };
          });
        }
      },
      limit: 8
    });

    // Clear suggestions and cache when switching workspaces.
    selectana.clear();
    selectana.clearRemoteCache();
    selectana.clearPrefetchCache();
    // Initialize the Bloodhound suggestion engine.
    // This is a truthy call, which will recreate the engine as if it were the first call.
    selectana.initialize(true);

    var assignee_input = $('#assignee_input');
    // Remove the existing typeahead, we need a new one.
    assignee_input.typeahead('destroy');

    var onSelected = function (eventObject, suggestionObject, suggestionDataset) {
      console.log(suggestionObject.photo_url);
      $('#assignee_list').html(suggestionObject.id);
    };



    // Instantiate the Typeahead UI
    assignee_input.typeahead({
      hint: true,
      highlight: true
    }, {
      displayKey:
        function(item) {
          return item.value;
        },
      source: selectana.ttAdapter()
    }).on('typeahead:selected', onSelected);
  },

  /**
   * Creates a typeahead.js object with bloodhound engine that is attached to
   * the project input.
   */
  createProjectTypeahead: function() {
    var me = this;
    // Instantiate the Bloodhound suggestion engine
    var selectana = new Bloodhound({
      datumTokenizer: function (datum) {
        return Bloodhound.tokenizers.whitespace(datum.value);
      },
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      remote: {
        url: Asana.ApiBridge.baseApiUrl() + '/workspaces/'
          + me.selectedWorkspaceId()
          + '/typeahead?type=project&query=%QUERY',
        ajax : {
          beforeSend: function(jqXhr, settings){
            // WARNING: This will be deprecated, please see api_bridge.js
            jqXhr.setRequestHeader('X-Allow-Asana-Client', '1');
          }
        },
        filter: function (results) {
          return $.map(results.data, function (result) {
            return {
              value: result.name,
              id: result.id
            };
          });
        }
      },
      limit: 8
    });

    // Clear suggestions and cache when switching workspaces.
    selectana.clear();
    selectana.clearRemoteCache();
    selectana.clearPrefetchCache();
    // Initialize the Bloodhound suggestion engine.
    // This is a truthy call, which will recreate the engine as if it were the first call.
    selectana.initialize(true);

    var project_input = $('#project_input');
    // Remove the existing typeahead, we need a new one.
    project_input.typeahead('destroy');

    var onSelected = function (eventObject, suggestionObject, suggestionDataset) {
      $('#project_list').html(suggestionObject.id);
    };

    // Instantiate the Typeahead UI
    project_input.typeahead({
      hint: true,
      highlight: true
    }, {
      displayKey: 'value',
      source: selectana.ttAdapter()
    }).on('typeahead:selected', onSelected);
  },

  /**
   * Update the list of users as a result of setting/changing the workspace.
   */
  onWorkspaceChanged: function() {
    var me = this;
    var workspace_id = me.selectedWorkspaceId();
    // Update selected workspace
    $("#workspace").html($("#workspace_select option:selected").text());

    // Save selection as new default.
    me.options.default_workspace_id = workspace_id;
    Asana.ServerModel.saveOptions(me.options, function() {});

    // Update assignee list.
    me.setAddEnabled(false);
    Asana.ServerModel.users(workspace_id, function(users) {
      console.log(users);

      if(users.length == 0) {
        users.push(default_user);
      }

      me.users = users;
      
      var select = $("#assignee_select");
      select.html("");
      users.forEach(function(user) {
        $("#assignee_select").append(
            "<option value='" + user.id + "'>" + user.name + "</option>");
      });

      //me.typeahead.updateUsers(users);
      //me.setAddEnabled(true);
    });

    // Create the project typeahead, reset for the new workspace.
    me.createUserTypeahead();
    me.createProjectTypeahead();
    me.setAddEnabled(true);

  },



  /**
   * @return {Integer} ID of the selected workspace.
   */
  selectedWorkspaceId: function() {
    return parseInt($("#workspace_select").val(), 10);
  },

  assignTaskToUser: function() {
    var me = this;
    var assignee_input = $("#assignee_list");
    // If an assignee was selected, use that person.
    if (assignee_input.val() !== "") {
      return $("#assignee_list").text();
    }
    var project_input = $("#project_input");
    // If there's no assignee AND no project, assign to self.
    if (assignee_input.val() === "" && project_input.val() === "") {
      return "me";
    }

    // Otherwise, let user place task in a project.
    return "";
  },

  /**
   * Create a task in asana using the data in the form.
   */
  createTask: function() {
    
    if($("#name_input").val().length == 0){
      p.showInfo("Task name can't be empty");
      return false;
    }

    var me = this;

    // Update UI to reflect attempt to create task.
    console.info("Creating task");
    me.hideMessage("error");
    me.setAddWorking(true);

    if (!me.is_first_add) {
      Asana.ServerModel.logEvent({
        name: "ChromeExtension-CreateTask-MultipleTasks"
      });
    }

    Asana.ServerModel.createTask(
        me.selectedWorkspaceId(),
        {
            name: $("#name_input").val(),
            notes: $("#notes_input").val(),
            // Default assignee to self
            assignee: me.assignTaskToUser(),
            projects: (($("#project_input").val() !== "") ?
                [$("#project_list").text()] : [])
        },
        function(task) {
          // Success! Show task success, then get ready for another input.
          Asana.ServerModel.logEvent({
            name: "ChromeExtension-CreateTask-Success"
          });
          
          me.setAddWorking(false);
          me.taskAddedSuccess(task);
          me.resetFields();
          $("#name_input").focus();
        },
        function(response) {
          // Failure. :( Show error, but leave form available for retry.
          Asana.ServerModel.logEvent({
            name: "ChromeExtension-CreateTask-Failure"
          });
          me.setAddWorking(false);
          me.showError(response.errors[0].message);
        });
  },

  /**
   * Helper to show a success message after a task is added.
   */
  taskAddedSuccess: function(task) {
    var me = this;
    Asana.ServerModel.taskViewUrl(task, function(url) {
      var name = task.name.replace(/^\s*/, "").replace(/\s*$/, "");
      var link = $("#new_task_link");
      link.attr("href", url);
      link.text(name !== "" ? name : "Task");
      link.unbind("click");
      link.click(function() {
        chrome.tabs.create({url: url});
        window.close();
        return false;
      });

      // Reset logging for multi-add
      me.has_edited_name = true;
      me.has_edited_notes = true;
      me.has_reassigned = true;
      me.is_first_add = false;


      $("#task_added").css("display", "inline-block");
      $('#task_added').animate({"opacity": "1"}, "fast");

      setTimeout(function(){p.hideMessage("task_added")}, 15000);
    });
  },

  /**
   * Show the login page.
   */
  showLogin: function(login_url, signup_url) {
    var me = this;
    $("#login_button").click(function() {
      chrome.tabs.create({url: login_url});
      window.close();
      return false;
    });
    $("#signup_button").click(function() {
      chrome.tabs.create({url: signup_url});
      window.close();
      return false;
    });
    me.showView("login");
  },

  firstInput: function() {
    return $("#workspace_select");
  },

  lastInput: function() {
    return $("#add_button");
  },

  createTaskUrl: function(taskId) {
    return "https://app.asana.com/0/"+taskId+"/"+taskId
  }
};

/***********************************************************
 * Handlers
 ***********************************************************/

/**
 * Click in done.
 **/
$(".done").click(function() {
  var ids = [];
  $('#tasks_view :checked').each(function() {
    var id = $(this).attr('id');
    ids.push(id);
  });

  if(ids.length == 0){
    p.showInfo("Please select a task first.")
    return;
  }
  
  p.tasksCompleted = ids.length;

  // show loading gif
  $(".loading").show();
  
  ids.forEach(function(id){
    Asana.ServerModel.markAsDone(id,{
          completed: "true"
        }, 
        function(results) {
          p.showSuccess("Task <b>'<a href='"+p.createTaskUrl(results.id)+"' target='_blank'>"+results.name+"</a>'</b> Completed");
          $("#"+results.id).parents('tr.taskLine').remove();
          // Refresh screen
          p.refreshTasksCounter();
          $(".loading").hide();
        }, 
        function() {
          p.failed = true;
          p.showError();
          $(".loading").hide();
        }
    );  
  });

  
});
/**
 * Click in add.
 **/
$(".add").click(function() {
  p.switchToAddView();
});

$('body').keyup(function(event) {
    
    // Go to add view
    if(event.keyCode == 13 && !p.inAddTaskView) {
      p.switchToAddView();
    }
   
});

/**
 * Click in back.
 **/
$(".back").click(function() {
  p.inAddTaskView = false;
  
  $('#add_view').animate({"margin-left": "450px"}, "fast");
  $('.add').animate({"right": "4px"}, "fast");
  $('.done').animate({"right": "39px"}, "fast");
  p.showView("tasks");
  $('#tasks_view').animate({"margin-left": "0px"}, "fast");
  p.getRemainingTasks();
  
});


/**
 * Toggle lists
 **/
$( "#tasksTable h3" ).click(function() {
      var target = $( this );
      target.next().toggleClass( "hideTaskList" );
      if(target.children(".toggleButton").html() == "-") {
        target.children(".toggleButton").html("+");
      } else {
        target.children(".toggleButton").html("-");
      }
    });

$(window).load(function() {
  p.onLoad();
});

// This is a workaround to add a loading indicator for typeahead.js.
// See https://github.com/twitter/typeahead.js/issues/284
$(document).ajaxSend(function(event, jqXHR, settings) {
    // display spinner
    $("#spinner").removeClass("indicator-hide");
    Asana.ServerModel.logEvent({
      name: "ChromeExtension-Typeahead-SearchStarted"
    });
});

$(document).ajaxComplete(function(event, jqXHR, settings) {
    $("#spinner").addClass("indicator-hide");
    Asana.ServerModel.logEvent({
      name: "ChromeExtension-Typeahead-SearchComplete"
    });
});

 (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

  ga('create', 'UA-1680323-8', 'auto');
  ga('send', 'pageview');
