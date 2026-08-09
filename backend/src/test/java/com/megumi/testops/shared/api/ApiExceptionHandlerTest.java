package com.megumi.testops.shared.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

class ApiExceptionHandlerTest {
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new FailureController())
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void domainFailureUsesStructuredProblemContract() throws Exception {
        mvc.perform(get("/test/domain").header("X-Correlation-Id", "qa-correlation"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("input_required"))
                .andExpect(jsonPath("$.correlationId").value("qa-correlation"))
                .andExpect(jsonPath("$.errors[0].path").value("steps[2].inputValue"))
                .andExpect(jsonPath("$.errors[0].stepPosition").value(2));
    }

    @Test
    void beanValidationUsesErrorsArray() throws Exception {
        mvc.perform(post("/test/validation").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.errors[0].path").value("name"))
                .andExpect(jsonPath("$.errors[0].code").value("not_blank"));
    }

    @Test
    void unexpectedFailureRemainsSanitized() throws Exception {
        mvc.perform(get("/test/unexpected"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("internal_error"))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @RestController
    static class FailureController {
        @GetMapping("/test/domain")
        void domain() {
            throw new ApiException(HttpStatus.BAD_REQUEST, "input_required", "Input is required",
                    "steps[2].inputValue", 2);
        }

        @PostMapping("/test/validation")
        void validation(@Valid @RequestBody ValidationRequest request) { }

        @GetMapping("/test/unexpected")
        void unexpected() {
            throw new IllegalStateException("sensitive implementation detail");
        }
    }

    record ValidationRequest(@NotBlank String name) { }
}
